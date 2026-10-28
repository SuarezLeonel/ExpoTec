import { audit } from './audit.js';
import { one, rows } from '../database/db.js';
import { has } from '../middleware/auth.js';
import { ensure } from './errors.js';
import { schemas } from './validation.js';
import { ensureTablesDoNotOverlap } from './floor-plan-validation.js';
import { define, type Handler } from './command-types.js';

export const floorPlanCommands: Record<string, Handler> = {
  'floor-plan.draft.save': define(schemas['floor-plan.draft.save'], async (ctx, input) => {
    has(ctx, 'manage_tables');
    const saved = await one(
      ctx.db,
      `UPDATE floor_plan_state SET draft=$2::jsonb,draft_revision=draft_revision+1,
       updated_by=$3,updated_at=now() WHERE id=1 AND draft_revision=$1
       RETURNING draft_revision,version`,
      [input.expected_revision, JSON.stringify(input.layout), ctx.user.id],
    );
    ensure(
      saved,
      409,
      'FLOOR_PLAN_CHANGED',
      'Otro usuario guardó un borrador. Actualizá el plano antes de seguir.',
    );
    await audit(ctx, 'floor-plan.draft.save', 'floor_plan', undefined, undefined, {
      draft_revision: saved.draft_revision,
      table_count: input.layout.tables.length,
      element_count: input.layout.elements.length,
    });
    return saved;
  }),
  'floor-plan.publish': define(schemas['floor-plan.publish'], async (ctx, input) => {
    has(ctx, 'manage_tables');
    const state = await one(ctx.db, 'SELECT * FROM floor_plan_state WHERE id=1 FOR UPDATE');
    ensure(state, 409, 'FLOOR_PLAN_MISSING', 'No se encontró la distribución guardada.');
    ensure(
      Number(state.draft_revision) === input.expected_revision &&
        Number(state.version) === input.expected_version,
      409,
      'FLOOR_PLAN_CHANGED',
      'El borrador o el plano publicado cambió. Actualizá antes de publicar.',
    );
    const layout = schemas['floor-plan.draft.save'].shape.layout.parse(state.draft);
    ensureTablesDoNotOverlap(layout.tables);
    const ids = layout.tables.map((table) => table.id);
    const existing = await rows(
      ctx.db,
      'SELECT id,label FROM dining_tables WHERE label=ANY($1::text[]) AND NOT (id=ANY($2::uuid[]))',
      [layout.tables.map((t) => t.label), ids],
    );
    ensure(
      existing.length === 0,
      409,
      'TABLE_LABEL_TAKEN',
      'Un identificador de mesa ya pertenece a otra mesa, incluso si está inactiva.',
    );
    const activeAccounts = await rows(
      ctx.db,
      "SELECT table_id,guests FROM accounts WHERE status IN ('open','requested') FOR UPDATE",
    );
    const candidates = new Map(layout.tables.map((table) => [table.id, table]));
    for (const account of activeAccounts) {
      const table = candidates.get(String(account.table_id));
      ensure(
        table?.active && table.capacity >= Number(account.guests),
        409,
        'ACTIVE_TABLE_CONFLICT',
        'El plano no puede desactivar ni reducir la capacidad de una mesa con cuenta abierta.',
      );
    }
    const before = state.published;
    for (const table of layout.tables) {
      await ctx.db.query(
        `INSERT INTO dining_tables(id,label,capacity,sector,x,y,shape,width,height,rotation,active)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT(id) DO UPDATE SET label=excluded.label,capacity=excluded.capacity,
         sector=excluded.sector,x=excluded.x,y=excluded.y,shape=excluded.shape,
         width=excluded.width,height=excluded.height,rotation=excluded.rotation,
         active=excluded.active,updated_at=now()`,
        [
          table.id,
          table.label,
          table.capacity,
          table.sector,
          table.x,
          table.y,
          table.shape,
          table.width,
          table.height,
          table.rotation,
          table.active,
        ],
      );
    }
    await ctx.db.query(
      'UPDATE dining_tables SET active=false,updated_at=now() WHERE NOT (id=ANY($1::uuid[]))',
      [ids],
    );
    const result = await one(
      ctx.db,
      `UPDATE floor_plan_state SET published=draft,version=version+1,draft_revision=draft_revision+1,
       updated_by=$1,updated_at=now() WHERE id=1 RETURNING version,draft_revision,published`,
      [ctx.user.id],
    );
    await audit(ctx, 'floor-plan.publish', 'floor_plan', undefined, before, result);
    return result;
  }),
};
