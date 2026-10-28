import { one, rows, type DB } from '../database/db.js';
import { ensure } from './errors.js';

export async function openCash(db: DB) {
  const session = await one(db, "SELECT * FROM cash_sessions WHERE status='open' FOR UPDATE");
  ensure(session, 409, 'CASH_CLOSED', 'Abrí la caja antes de registrar cobros o reintegros.');
  return session;
}
export async function cashSummary(db: DB) {
  const session = await one(db, 'SELECT * FROM cash_sessions ORDER BY created_at DESC LIMIT 1');
  const cashId = session?.id ?? null;
  const methods = await rows(
    db,
    `SELECT m.method,coalesce(p.paid,0)::bigint paid_cents,coalesce(r.refunded,0)::bigint refunded_cents,(coalesce(p.paid,0)-coalesce(r.refunded,0))::bigint net_cents FROM (VALUES('cash'),('debit'),('credit'),('transfer')) m(method) LEFT JOIN (SELECT method,sum(amount_cents) paid FROM payments WHERE cash_session_id=$1 GROUP BY method) p ON p.method=m.method LEFT JOIN (SELECT p.method,sum(r.amount_cents) refunded FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.cash_session_id=$1 GROUP BY p.method) r ON r.method=m.method`,
    [cashId],
  );
  const moves = await one(
    db,
    `SELECT coalesce(sum(amount_cents) FILTER(WHERE kind='in'),0)::bigint in_cents,coalesce(sum(amount_cents) FILTER(WHERE kind='out'),0)::bigint out_cents FROM cash_movements WHERE cash_session_id=$1`,
    [cashId],
  );
  const cash = methods.find((m) => m.method === 'cash')!;
  const blockers = await one(
    db,
    `SELECT (SELECT count(*) FROM accounts WHERE status IN ('open','requested'))::integer open_accounts,(SELECT count(*) FROM print_jobs WHERE status IN ('generated','sent','failed','uncertain'))::integer pending_prints,(SELECT count(*) FROM invoices WHERE status IN ('prepared','requested','uncertain'))::integer pending_invoices`,
  );
  const opening = (session?.opening_cents as number | undefined) ?? 0;
  return {
    session: session ?? null,
    opening_cents: opening,
    cash_payments_cents: cash.paid_cents as number,
    cash_refunds_cents: cash.refunded_cents as number,
    in_cents: moves!.in_cents as number,
    out_cents: moves!.out_cents as number,
    expected_cents:
      opening +
      (cash.net_cents as number) +
      (moves!.in_cents as number) -
      (moves!.out_cents as number),
    by_method: methods,
    blockers: blockers!,
  };
}
