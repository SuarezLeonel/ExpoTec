import { one, rows } from '../database/db.js';
import { has, userById } from '../middleware/auth.js';
import { ensure } from './errors.js';
import { schemas, type Data } from './validation.js';
import { define, type Handler } from './command-types.js';
import { audit } from './audit.js';
import { account, bump, editable, item, orderTicket, tableActive } from './account-data.js';
import type { CommandContext } from './types.js';

async function moveItems(
  ctx: CommandContext,
  source: string,
  target: string,
  selections: Data<'account.split'>['selections'],
) {
  for (const selection of selections) {
    const value = await item(ctx, source, selection.item_id);
    ensure(
      value.status !== 'void' && selection.quantity <= value.quantity,
      422,
      'INVALID_QUANTITY',
      'La cantidad elegida supera el consumo disponible.',
    );
    let movedId = value.id;
    if (selection.quantity === value.quantity)
      await ctx.db.query('UPDATE items SET account_id=$1,updated_at=now() WHERE id=$2', [
        target,
        value.id,
      ]);
    else {
      const created = await one(
        ctx.db,
        'INSERT INTO items(account_id,product_id,name,description,unit_cents,quantity,notes,destination,status) SELECT $1,product_id,name,description,unit_cents,$2,notes,destination,status FROM items WHERE id=$3 RETURNING id',
        [target, selection.quantity, value.id],
      );
      movedId = created!.id as string;
      await ctx.db.query(
        'INSERT INTO item_addons(item_id,addon_id,name,price_cents) SELECT $1,addon_id,name,price_cents FROM item_addons WHERE item_id=$2',
        [created!.id, value.id],
      );
      await ctx.db.query('UPDATE items SET quantity=quantity-$1,updated_at=now() WHERE id=$2', [
        selection.quantity,
        value.id,
      ]);
    }
    if (value.status !== 'draft')
      await orderTicket(
        ctx,
        target,
        [movedId],
        'correction',
        'Traslado de consumo ya enviado. No preparar de nuevo.',
        {
          source_account_id: source,
          target_account_id: target,
          source_item_id: value.id,
          target_item_id: movedId,
          moved_quantity: selection.quantity,
          previous_quantity: value.quantity,
          status: value.status,
        },
      );
  }
}
export const accountCommands: Record<string, Handler> = {
  'account.open': define(schemas['account.open'], async (ctx, input) => {
    has(ctx, 'operate');
    const table = await tableActive(ctx, input.table_id);
    ensure(
      input.guests <= (table.capacity as number),
      422,
      'CAPACITY',
      'Los comensales superan la capacidad de la mesa. Uní físicamente las mesas y ajustá la capacidad si corresponde.',
    );
    const waiterId = ctx.mode === 'terminal' ? ctx.user.id : (input.waiter_id ?? ctx.user.id);
    const waiter = await userById(ctx.db, waiterId);
    ensure(
      waiter && ['waiter', 'cashier', 'admin'].includes(waiter.role),
      422,
      'WAITER_INVALID',
      'Elegí un responsable habilitado para salón.',
    );
    ensure(
      !(await one(
        ctx.db,
        "SELECT 1 FROM accounts WHERE table_id=$1 AND status IN ('open','requested')",
        [input.table_id],
      )),
      409,
      'TABLE_OCCUPIED',
      'La mesa ya tiene una cuenta abierta. Usá dividir cuenta para crear otra.',
    );
    const result = await one(
      ctx.db,
      'INSERT INTO accounts(table_id,waiter_id,guests) VALUES($1,$2,$3) RETURNING *',
      [input.table_id, waiterId, input.guests],
    );
    await audit(ctx, 'account.open', 'account', result!.id as string, undefined, result);
    return result;
  }),
  'account.update': define(schemas['account.update'], async (ctx, input) => {
    has(ctx, 'operate');
    const before = await account(ctx, input.account_id, input.version);
    if (input.guests) {
      const table = await tableActive(ctx, before.table_id);
      ensure(
        input.guests <= (table.capacity as number),
        422,
        'CAPACITY',
        'Los comensales superan la capacidad configurada de esta mesa.',
      );
    }
    ensure(
      ctx.mode !== 'terminal' || !input.waiter_id || input.waiter_id === before.waiter_id,
      403,
      'MANAGEMENT_REQUIRED',
      'El cambio de responsable se realiza desde Gestión.',
    );
    if (input.waiter_id) {
      const waiter = await userById(ctx.db, input.waiter_id);
      ensure(
        waiter && ['waiter', 'cashier', 'admin'].includes(waiter.role),
        422,
        'WAITER_INVALID',
        'El responsable debe estar habilitado para salón.',
      );
    }
    await ctx.db.query(
      'UPDATE accounts SET waiter_id=coalesce($1,waiter_id),guests=coalesce($2,guests) WHERE id=$3',
      [input.waiter_id, input.guests, before.id],
    );
    if (input.waiter_id && input.waiter_id !== before.waiter_id) {
      const sent = await rows(
        ctx.db,
        "SELECT id FROM items WHERE account_id=$1 AND status NOT IN ('draft','void','delivered')",
        [before.id],
      );
      if (sent.length)
        await orderTicket(
          ctx,
          before.id,
          sent.map((i) => i.id as string),
          'correction',
          'Cambio de responsable; no preparar de nuevo.',
          { waiter_id: before.waiter_id },
        );
    }
    const after = await bump(ctx, before.id);
    await audit(ctx, 'account.update', 'account', before.id, before, after);
    return after;
  }),
  'account.move': define(schemas['account.move'], async (ctx, input) => {
    has(ctx, 'operate');
    const before = await account(ctx, input.account_id, input.version);
    const target = await tableActive(ctx, input.table_id);
    ensure(
      before.guests <= (target.capacity as number),
      422,
      'CAPACITY',
      'La mesa destino no tiene capacidad para estos comensales.',
    );
    ensure(
      target.id !== before.table_id,
      422,
      'SAME_TABLE',
      'Elegí otra mesa para trasladar la cuenta.',
    );
    ensure(
      !(await one(
        ctx.db,
        "SELECT 1 FROM accounts WHERE table_id=$1 AND status IN ('open','requested')",
        [target.id],
      )),
      409,
      'TABLE_OCCUPIED',
      'La mesa destino ya tiene una cuenta. Usá la agrupación de cuentas cuando sea válida.',
    );
    await ctx.db.query('UPDATE accounts SET table_id=$1 WHERE id=$2', [target.id, before.id]);
    const sent = await rows(
      ctx.db,
      "SELECT id FROM items WHERE account_id=$1 AND status NOT IN ('draft','void','delivered')",
      [before.id],
    );
    if (sent.length)
      await orderTicket(
        ctx,
        before.id,
        sent.map((i) => i.id as string),
        'correction',
        'Traslado de mesa; no preparar de nuevo.',
        { table_id: before.table_id },
      );
    const after = await bump(ctx, before.id);
    await audit(ctx, 'account.move', 'account', before.id, before, after);
    return after;
  }),
  'account.request': define(schemas['account.request'], async (ctx, input) => {
    has(ctx, 'operate');
    const before = await account(ctx, input.account_id, input.version);
    ensure(before.status === 'open', 409, 'INVALID_STATE', 'La cuenta ya fue solicitada.');
    await ctx.db.query("UPDATE accounts SET status='requested' WHERE id=$1", [before.id]);
    const after = await bump(ctx, before.id);
    await audit(ctx, 'account.request', 'account', before.id, before, after);
    return after;
  }),
  'account.close': define(schemas['account.close'], async (ctx, input) => {
    has(ctx, 'cash');
    const before = await account(ctx, input.account_id, input.version);
    ensure(
      before.balance_cents === 0,
      409,
      'BALANCE_PENDING',
      'La cuenta tiene saldo pendiente. Completá el cobro antes de cerrar.',
    );
    ensure(
      !(await one(ctx.db, "SELECT 1 FROM items WHERE account_id=$1 AND status='draft'", [
        before.id,
      ])),
      409,
      'ITEMS_PENDING',
      'Quedan ítems en borrador. Enviá el pedido antes de cerrar.',
    );
    await ctx.db.query("UPDATE accounts SET status='closed',closed_at=now() WHERE id=$1", [
      before.id,
    ]);
    const after = await bump(ctx, before.id);
    await audit(ctx, 'account.close', 'account', before.id, before, after);
    return after;
  }),
  'account.split': define(schemas['account.split'], async (ctx, input) => {
    has(ctx, 'operate');
    const before = await account(ctx, input.account_id, input.version);
    await editable(ctx, before);
    const sister = await one(
      ctx.db,
      'INSERT INTO accounts(table_id,waiter_id,guests) VALUES($1,$2,$3) RETURNING id',
      [before.table_id, before.waiter_id, before.guests],
    );
    const targetId = sister!.id as string;
    await moveItems(ctx, before.id, targetId, input.selections);
    const source = await bump(ctx, before.id);
    const target = await account(ctx, targetId);
    await audit(ctx, 'account.split', 'account', before.id, before, {
      source,
      target,
      selections: input.selections,
    });
    return { source, target };
  }),
  'item.transfer': define(schemas['item.transfer'], async (ctx, input) => {
    has(ctx, 'operate');
    ensure(
      input.account_id !== input.target_account_id,
      422,
      'SAME_ACCOUNT',
      'Elegí otra cuenta para trasladar los ítems.',
    );
    const sourceBefore = await account(ctx, input.account_id, input.version);
    const targetBefore = await account(ctx, input.target_account_id, input.target_version);
    await editable(ctx, sourceBefore);
    await editable(ctx, targetBefore);
    await moveItems(ctx, sourceBefore.id, targetBefore.id, input.selections);
    const source = await bump(ctx, sourceBefore.id);
    const target = await bump(ctx, targetBefore.id);
    await audit(
      ctx,
      'item.transfer',
      'account',
      sourceBefore.id,
      { sourceBefore, targetBefore },
      { source, target, selections: input.selections },
    );
    return { source, target };
  }),
  'account.merge': define(schemas['account.merge'], async (ctx, input) => {
    has(ctx, 'operate');
    ensure(
      input.account_id !== input.source_account_id,
      422,
      'SAME_ACCOUNT',
      'Elegí dos cuentas diferentes.',
    );
    const targetBefore = await account(ctx, input.account_id, input.version);
    const sourceBefore = await account(ctx, input.source_account_id, input.source_version);
    await editable(ctx, targetBefore);
    await editable(ctx, sourceBefore);
    const sent = await rows(
      ctx.db,
      "SELECT id FROM items WHERE account_id=$1 AND status NOT IN ('draft','void','delivered')",
      [sourceBefore.id],
    );
    await ctx.db.query('UPDATE items SET account_id=$1,updated_at=now() WHERE account_id=$2', [
      targetBefore.id,
      sourceBefore.id,
    ]);
    await ctx.db.query(
      "UPDATE accounts SET status='merged',merged_into=$1,closed_at=now(),version=version+1 WHERE id=$2",
      [targetBefore.id, sourceBefore.id],
    );
    if (sent.length)
      await orderTicket(
        ctx,
        targetBefore.id,
        sent.map((i) => i.id as string),
        'correction',
        'Agrupación de cuentas; no preparar de nuevo.',
        { source_account_id: sourceBefore.id, target_account_id: targetBefore.id },
      );
    const target = await bump(ctx, targetBefore.id);
    await audit(
      ctx,
      'account.merge',
      'account',
      targetBefore.id,
      { targetBefore, sourceBefore },
      { target, source_id: sourceBefore.id },
    );
    return { target, source_id: sourceBefore.id };
  }),
};
