import { one, rows } from '../database/db.js';
import { proportionalCents } from './money.js';
import type { Account, CommandContext } from './types.js';

/** Allocate an account discount by cumulative integer differences, preserving every cent. */
export async function netLineCents(
  ctx: CommandContext,
  current: Account,
): Promise<Map<string, number>> {
  const lines = await rows(
    ctx.db,
    `SELECT i.id,i.line_cents-coalesce(d.discount,0) net FROM item_totals i LEFT JOIN (SELECT item_id,sum(amount_cents) discount FROM discounts WHERE item_id IS NOT NULL GROUP BY item_id) d ON d.item_id=i.id WHERE i.account_id=$1 AND i.status<>'void' ORDER BY i.id`,
    [current.id],
  );
  const discount = await one(
    ctx.db,
    'SELECT coalesce(sum(amount_cents),0)::bigint amount FROM discounts WHERE account_id=$1 AND item_id IS NULL',
    [current.id],
  );
  const total = lines.reduce((sum, line) => sum + Number(line.net), 0);
  const amount = discount!.amount as number;
  const result = new Map<string, number>();
  let cumulative = 0;
  for (const line of lines) {
    const net = Number(line.net);
    const previous = total > 0 ? proportionalCents(amount, cumulative, total) : 0;
    cumulative += net;
    const next = total > 0 ? proportionalCents(amount, cumulative, total) : 0;
    result.set(line.id as string, net - (next - previous));
  }
  return result;
}
