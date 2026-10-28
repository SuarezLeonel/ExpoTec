import { one, rows } from '../database/db.js';
import { ensure } from './errors.js';
import type { Account, CommandContext, Item } from './types.js';

export async function account(
  ctx: CommandContext,
  id: string,
  version?: number,
  allowClosed = false,
): Promise<Account> {
  await ctx.db.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [id]);
  const result = await one<Account>(ctx.db, 'SELECT * FROM account_totals WHERE id=$1', [id]);
  ensure(
    result && result.status !== 'merged',
    404,
    'ACCOUNT_NOT_FOUND',
    'No se encontró la cuenta.',
  );
  ensure(
    allowClosed || result.status !== 'closed',
    409,
    'ACCOUNT_CLOSED',
    'La cuenta ya está cerrada.',
  );
  ensure(
    version === undefined || result.version === version,
    409,
    'VERSION_CONFLICT',
    'Otra persona modificó la cuenta. Actualizá y revisá los cambios.',
  );
  return result;
}
export async function bump(ctx: CommandContext, id: string): Promise<Account> {
  await ctx.db.query('UPDATE accounts SET version=version+1,updated_at=now() WHERE id=$1', [id]);
  return (await one<Account>(ctx.db, 'SELECT * FROM account_totals WHERE id=$1', [id]))!;
}
export async function editable(ctx: CommandContext, value: Account) {
  const paid = await one(ctx.db, 'SELECT 1 FROM payments WHERE account_id=$1 LIMIT 1', [value.id]);
  const discounted = await one(ctx.db, 'SELECT 1 FROM discounts WHERE account_id=$1 LIMIT 1', [
    value.id,
  ]);
  ensure(
    !paid && !discounted,
    409,
    'ACCOUNT_LOCKED_FINANCIALLY',
    'Esta cuenta tiene pagos o descuentos. Conservá la venta y usá un reintegro compensatorio; no se pueden cambiar sus consumos.',
  );
}
export async function item(ctx: CommandContext, accountId: string, itemId: string): Promise<Item> {
  await ctx.db.query('SELECT id FROM items WHERE id=$1 AND account_id=$2 FOR UPDATE', [
    itemId,
    accountId,
  ]);
  const value = await one<Item>(ctx.db, 'SELECT * FROM item_totals WHERE id=$1 AND account_id=$2', [
    itemId,
    accountId,
  ]);
  ensure(value, 404, 'ITEM_NOT_FOUND', 'No se encontró el ítem en esta cuenta.');
  return value;
}
export async function tableActive(ctx: CommandContext, id: string) {
  const table = await one(ctx.db, 'SELECT * FROM dining_tables WHERE id=$1 AND active FOR UPDATE', [
    id,
  ]);
  ensure(table, 422, 'TABLE_UNAVAILABLE', 'La mesa no está activa.');
  return table;
}
export async function orderTicket(
  ctx: CommandContext,
  accountId: string,
  itemIds: string[],
  kind: 'new' | 'correction' | 'void',
  reason?: string,
  previous?: unknown,
) {
  const values = await rows(
    ctx.db,
    `SELECT i.*,coalesce((SELECT json_agg(json_build_object('name',a.name,'price_cents',a.price_cents)) FROM item_addons a WHERE a.item_id=i.id),'[]'::json) addons FROM item_totals i WHERE i.id=ANY($1::uuid[])`,
    [itemIds],
  );
  const metadata = await one(
    ctx.db,
    'SELECT t.label,u.name waiter FROM accounts a JOIN dining_tables t ON t.id=a.table_id JOIN users u ON u.id=a.waiter_id WHERE a.id=$1',
    [accountId],
  );
  for (const destination of new Set(values.map((v) => v.destination as string))) {
    if (destination === 'none') continue;
    const send = await one(
      ctx.db,
      'INSERT INTO order_sends(account_id,user_id,destination,kind) VALUES($1,$2,$3,$4) RETURNING id',
      [accountId, ctx.user.id, destination, kind],
    );
    const group = values.filter((v) => v.destination === destination);
    for (const value of group)
      await ctx.db.query(
        'INSERT INTO order_send_items(send_id,item_id,snapshot) VALUES($1,$2,$3)',
        [send!.id, value.id, { ...value, reason, previous }],
      );
    const content = [
      `DEMOSTRACIÓN · ${kind === 'new' ? 'COMANDA NUEVA' : kind === 'void' ? 'ANULACIÓN' : 'CORRECCIÓN · REEMPLAZA SOLO ÍTEMS INDICADOS'}`,
      `Mesa ${metadata?.label} · ${metadata?.waiter} · ${new Date().toISOString()}`,
      ...group.map(
        (v) =>
          `${v.quantity} × ${v.name} | ${JSON.stringify(v.addons)} | ${v.notes} | estado ${v.status}`,
      ),
      reason ?? '',
      previous ? `Anterior: ${JSON.stringify(previous)}` : '',
    ].join('\n');
    await ctx.db.query(
      'INSERT INTO print_jobs(send_id,account_id,destination,content) VALUES($1,$2,$3,$4)',
      [send!.id, accountId, destination, content],
    );
  }
}
