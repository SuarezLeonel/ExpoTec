import { randomUUID } from 'node:crypto';
import { one, rows } from '../database/db.js';
import { has } from '../middleware/auth.js';
import { ensure } from './errors.js';
import { schemas } from './validation.js';
import { ensureTablesDoNotOverlap } from './floor-plan-validation.js';
import { define, type Handler } from './command-types.js';
import { audit } from './audit.js';
import { hashPin, pinLookup } from './operational-pin.js';
import { hashPassword } from './security.js';

export const catalogCommands: Record<string, Handler> = {
  'category.save': define(schemas['category.save'], async (ctx, input) => {
    has(ctx, 'manage_catalog');
    const before = input.id
      ? await one(ctx.db, 'SELECT * FROM categories WHERE id=$1', [input.id])
      : undefined;
    ensure(!input.id || before, 404, 'NOT_FOUND', 'No se encontró la categoría.');
    const parentId = input.parent_id === undefined ? (before?.parent_id ?? null) : input.parent_id;
    if (parentId) {
      const parent = await one(ctx.db, 'SELECT * FROM categories WHERE id=$1', [parentId]);
      ensure(
        parent && !parent.parent_id && parentId !== input.id,
        422,
        'INVALID_CATEGORY_PARENT',
        'Elegí una categoría principal distinta de esta subcategoría.',
      );
      ensure(
        !input.active || parent.active,
        422,
        'INACTIVE_CATEGORY_PARENT',
        'Activá la categoría principal antes de activar esta subcategoría.',
      );
      ensure(
        !input.id ||
          !(await one(ctx.db, 'SELECT 1 FROM categories WHERE parent_id=$1', [input.id])),
        422,
        'CATEGORY_HAS_CHILDREN',
        'Una categoría con subcategorías no puede convertirse en subcategoría.',
      );
    }
    const result = await one(
      ctx.db,
      'INSERT INTO categories(id,name,active,parent_id,sort_order) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active,parent_id=excluded.parent_id,sort_order=excluded.sort_order,updated_at=now() RETURNING *',
      [
        input.id ?? randomUUID(),
        input.name,
        input.active,
        parentId,
        input.sort_order ?? before?.sort_order ?? 0,
      ],
    );
    await audit(ctx, 'category.save', 'category', result!.id as string, before, result);
    return result;
  }),
  'addon.save': define(schemas['addon.save'], async (ctx, input) => {
    has(ctx, 'manage_catalog');
    const before = input.id
      ? await one(ctx.db, 'SELECT * FROM addons WHERE id=$1', [input.id])
      : undefined;
    ensure(!input.id || before, 404, 'NOT_FOUND', 'No se encontró el agregado.');
    const result = await one(
      ctx.db,
      'INSERT INTO addons(id,name,price_cents,active) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,price_cents=excluded.price_cents,active=excluded.active,updated_at=now() RETURNING *',
      [input.id ?? randomUUID(), input.name, input.price_cents, input.active],
    );
    await audit(ctx, 'addon.save', 'addon', result!.id as string, before, result);
    return result;
  }),
  'product.save': define(schemas['product.save'], async (ctx, input) => {
    has(ctx, 'manage_catalog');
    ensure(
      await one(ctx.db, 'SELECT 1 FROM categories WHERE id=$1', [input.category_id]),
      422,
      'CATEGORY_NOT_FOUND',
      'La categoría no existe.',
    );
    const addons = await rows(ctx.db, 'SELECT id FROM addons WHERE id=ANY($1::uuid[]) AND active', [
      input.addon_ids,
    ]);
    ensure(
      addons.length === input.addon_ids.length,
      422,
      'INVALID_ADDONS',
      'Uno o más agregados no están activos.',
    );
    const before = input.id
      ? await one(ctx.db, 'SELECT * FROM products WHERE id=$1', [input.id])
      : undefined;
    ensure(!input.id || before, 404, 'NOT_FOUND', 'No se encontró el producto.');
    const result = await one(
      ctx.db,
      `INSERT INTO products(id,category_id,name,description,price_cents,image_url,destination,available,active,visible_en_carta,variant_group,variant_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,name=excluded.name,description=excluded.description,price_cents=excluded.price_cents,image_url=excluded.image_url,destination=excluded.destination,available=excluded.available,active=excluded.active,visible_en_carta=excluded.visible_en_carta,variant_group=excluded.variant_group,variant_name=excluded.variant_name,updated_at=now() RETURNING *`,
      [
        input.id ?? randomUUID(),
        input.category_id,
        input.name,
        input.description,
        input.price_cents,
        input.image_url,
        input.destination,
        input.available,
        input.active,
        input.visible_en_carta,
        input.variant_group ?? before?.variant_group ?? '',
        input.variant_name ?? before?.variant_name ?? '',
      ],
    );
    await ctx.db.query('DELETE FROM product_addons WHERE product_id=$1', [result!.id]);
    for (const addonId of input.addon_ids)
      await ctx.db.query('INSERT INTO product_addons(product_id,addon_id) VALUES($1,$2)', [
        result!.id,
        addonId,
      ]);
    await audit(ctx, 'product.save', 'product', result!.id as string, before, {
      ...result,
      addon_ids: input.addon_ids,
    });
    return { ...result, addon_ids: input.addon_ids };
  }),
  'user.save': define(schemas['user.save'], async (ctx, input) => {
    has(ctx, 'manage_users');
    const before = input.id
      ? await one(ctx.db, 'SELECT id,username,name,role,active FROM users WHERE id=$1 FOR UPDATE', [
          input.id,
        ])
      : undefined;
    ensure(!input.id || before, 404, 'NOT_FOUND', 'No se encontró el usuario.');
    ensure(
      before?.role !== 'terminal',
      403,
      'TERMINAL_SYSTEM_USER',
      'La cuenta técnica de terminal no es un empleado editable.',
    );
    ensure(
      input.id || input.password,
      422,
      'PASSWORD_REQUIRED',
      'Indicá una contraseña de al menos 12 caracteres.',
    );
    if (before?.role === 'admin' && (!input.active || input.role !== 'admin')) {
      const admins = await rows(
        ctx.db,
        "SELECT id FROM users WHERE role='admin' AND active AND id<>$1",
        [input.id],
      );
      ensure(
        admins.length > 0,
        409,
        'LAST_ADMIN',
        'Debe permanecer al menos un administrador activo.',
      );
    }
    ensure(
      input.id !== ctx.user.id || input.active,
      409,
      'OWN_DEACTIVATION',
      'Usá otro administrador para desactivar tu usuario.',
    );
    const hashed = input.password ? await hashPassword(input.password) : undefined;
    const id = input.id ?? randomUUID();
    const lookup = input.pin
      ? pinLookup(input.pin)
      : input.id
        ? (await one(ctx.db, 'SELECT pin_lookup FROM users WHERE id=$1', [id]))?.pin_lookup
        : null;
    if (input.active && lookup)
      ensure(
        !(await one(ctx.db, 'SELECT id FROM users WHERE active AND pin_lookup=$1 AND id<>$2', [
          lookup,
          id,
        ])),
        409,
        'PIN_IN_USE',
        'Otro empleado activo ya tiene ese PIN. Elegí cuatro dígitos distintos para identificarlo sin ambigüedad.',
      );
    const pinHash = input.pin ? await hashPin(input.pin) : undefined;
    if (input.id)
      await ctx.db.query(
        'UPDATE users SET username=$1,name=$2,role=$3,active=$4,password_hash=coalesce($5,password_hash),updated_at=now() WHERE id=$6',
        [input.username, input.name, input.role, input.active, hashed, id],
      );
    else
      await ctx.db.query(
        'INSERT INTO users(id,username,name,role,active,password_hash) VALUES($1,$2,$3,$4,$5,$6)',
        [id, input.username, input.name, input.role, input.active, hashed],
      );
    if (pinHash) {
      await ctx.db.query(
        'UPDATE users SET pin_hash=$1,pin_version=pin_version+1,pin_lookup=$3 WHERE id=$2',
        [pinHash, id, lookup],
      );
      await ctx.db.query('DELETE FROM operational_grants WHERE user_id=$1', [id]);
    }
    if (input.id && (!input.active || input.role !== before?.role || hashed || pinHash)) {
      await ctx.db.query('DELETE FROM operational_grants WHERE user_id=$1', [id]);
      await ctx.db.query(
        'UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [id],
      );
    }
    const result = await one(
      ctx.db,
      'SELECT id,username,name,role,active,created_at FROM users WHERE id=$1',
      [id],
    );
    await audit(
      ctx,
      'user.save',
      'user',
      id,
      before,
      result,
      hashed || pinHash ? 'Alta o cambio de credenciales; secretos excluidos.' : undefined,
    );
    return result;
  }),
  'table.save': define(schemas['table.save'], async (ctx, input) => {
    has(ctx, 'manage_tables');
    const planState = await one(
      ctx.db,
      'SELECT draft,published FROM floor_plan_state WHERE id=1 FOR UPDATE',
    );
    ensure(
      planState && JSON.stringify(planState.draft) === JSON.stringify(planState.published),
      409,
      'FLOOR_PLAN_DRAFT_PENDING',
      'Hay un borrador administrativo sin publicar. Publicalo o descartalo antes de crear o modificar mesas.',
    );
    const before = input.id
      ? await one(ctx.db, 'SELECT * FROM dining_tables WHERE id=$1', [input.id])
      : undefined;
    const previousLayout = planState!.published as {
      tables: Record<string, unknown>[];
      elements: unknown[];
    };
    const candidateId = input.id ?? randomUUID();
    const candidateLayoutTable = {
      id: candidateId,
      label: input.label,
      capacity: input.capacity,
      sector: input.sector,
      x: input.x,
      y: input.y,
      active: input.active,
      shape: input.shape,
      width: input.width,
      height: input.height,
      rotation: input.rotation,
    };
    ensureTablesDoNotOverlap([
      ...previousLayout.tables.filter((table) => table.id !== candidateId),
      candidateLayoutTable,
    ] as Parameters<typeof ensureTablesDoNotOverlap>[0]);
    ensure(!input.id || before, 404, 'NOT_FOUND', 'No se encontró la mesa.');
    if (input.id && input.active)
      ensure(
        !(await one(
          ctx.db,
          "SELECT 1 FROM accounts WHERE table_id=$1 AND status IN ('open','requested') AND guests>$2",
          [input.id, input.capacity],
        )),
        422,
        'CAPACITY',
        'La capacidad nueva es menor que los comensales de una cuenta abierta.',
      );
    if (input.id && !input.active)
      ensure(
        !(await one(
          ctx.db,
          "SELECT 1 FROM accounts WHERE table_id=$1 AND status IN ('open','requested')",
          [input.id],
        )),
        409,
        'TABLE_HAS_ACCOUNT',
        'La mesa tiene una cuenta abierta. Cerrala o trasladala antes de darla de baja.',
      );
    const result = await one(
      ctx.db,
      'INSERT INTO dining_tables(id,label,capacity,sector,x,y,active,shape,width,height,rotation) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET label=excluded.label,capacity=excluded.capacity,sector=excluded.sector,x=excluded.x,y=excluded.y,active=excluded.active,shape=excluded.shape,width=excluded.width,height=excluded.height,rotation=excluded.rotation,updated_at=now() RETURNING *',
      [
        candidateId,
        input.label,
        input.capacity,
        input.sector,
        input.x,
        input.y,
        input.active,
        input.shape,
        input.width,
        input.height,
        input.rotation,
      ],
    );
    const layoutTable = {
      id: result!.id,
      label: result!.label,
      capacity: result!.capacity,
      sector: result!.sector,
      x: result!.x,
      y: result!.y,
      active: result!.active,
      shape: result!.shape,
      width: result!.width,
      height: result!.height,
      rotation: result!.rotation,
    };
    const updatedLayout = {
      ...previousLayout,
      tables: input.id
        ? previousLayout.tables.map((table) => (table.id === input.id ? layoutTable : table))
        : [...previousLayout.tables, layoutTable],
    };
    await ctx.db.query(
      'UPDATE floor_plan_state SET draft=$1::jsonb,published=$1::jsonb,version=version+1,draft_revision=draft_revision+1,updated_by=$2,updated_at=now() WHERE id=1',
      [JSON.stringify(updatedLayout), ctx.user.id],
    );
    await audit(ctx, 'table.save', 'table', result!.id as string, before, result);
    return result;
  }),
  'table.group': define(schemas['table.group'], async (ctx, input) => {
    has(ctx, 'operate');
    const tables = await rows(
      ctx.db,
      'SELECT * FROM dining_tables WHERE id=ANY($1::uuid[]) AND active FOR UPDATE',
      [input.table_ids],
    );
    ensure(
      tables.length === input.table_ids.length,
      422,
      'TABLE_UNAVAILABLE',
      'Una o más mesas no están activas.',
    );
    let groupId = input.group_id;
    if (groupId === undefined) {
      ensure(input.table_ids.length >= 2, 422, 'GROUP_SIZE', 'Elegí al menos dos mesas para unir.');
      groupId = (await one(ctx.db, 'INSERT INTO table_groups DEFAULT VALUES RETURNING id'))!
        .id as string;
    } else if (groupId)
      await ctx.db.query('INSERT INTO table_groups(id) VALUES($1) ON CONFLICT DO NOTHING', [
        groupId,
      ]);
    await ctx.db.query(
      'UPDATE dining_tables SET group_id=$1,updated_at=now() WHERE id=ANY($2::uuid[])',
      [groupId, input.table_ids],
    );
    await audit(ctx, 'table.group', 'table_group', groupId ?? undefined, tables, {
      table_ids: input.table_ids,
      group_id: groupId,
    });
    return { table_ids: input.table_ids, group_id: groupId };
  }),
};
