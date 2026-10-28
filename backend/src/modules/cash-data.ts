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
    `SELECT m.method,
            COALESCE(p.paid, 0) AS paid_cents,
            COALESCE(r.refunded, 0) AS refunded_cents,
            (COALESCE(p.paid, 0) - COALESCE(r.refunded, 0)) AS net_cents
     FROM (
       SELECT 'cash' AS method
       UNION ALL SELECT 'debit'
       UNION ALL SELECT 'credit'
       UNION ALL SELECT 'transfer'
     ) m
     LEFT JOIN (
       SELECT method, SUM(amount_cents) AS paid
       FROM payments
       WHERE cash_session_id = $1
       GROUP BY method
     ) p ON p.method = m.method
     LEFT JOIN (
       SELECT p.method, SUM(r.amount_cents) AS refunded
       FROM refunds r
       JOIN payments p ON p.id = r.payment_id
       WHERE r.cash_session_id = $1
       GROUP BY p.method
     ) r ON r.method = m.method`,
    [cashId],
  );
  const moves = await one(
    db,
    `SELECT COALESCE(SUM(CASE WHEN kind = 'in' THEN amount_cents ELSE 0 END), 0) AS in_cents,
            COALESCE(SUM(CASE WHEN kind = 'out' THEN amount_cents ELSE 0 END), 0) AS out_cents
     FROM cash_movements
     WHERE cash_session_id = $1`,
    [cashId],
  );
  const cash = methods.find((m) => m.method === 'cash') ?? {
    paid_cents: 0,
    refunded_cents: 0,
    net_cents: 0,
  };
  const blockers = await one(
    db,
    `SELECT (SELECT COUNT(*) FROM accounts WHERE status IN ('open','requested')) AS open_accounts,
            (SELECT COUNT(*) FROM print_jobs WHERE status IN ('generated','sent','failed','uncertain')) AS pending_prints,
            (SELECT COUNT(*) FROM invoices WHERE status IN ('prepared','requested','uncertain')) AS pending_invoices`,
  );
  const opening = (session?.opening_cents as number | undefined) ?? 0;
  return {
    session: session ?? null,
    opening_cents: opening,
    cash_payments_cents: (cash.paid_cents as number) || 0,
    cash_refunds_cents: (cash.refunded_cents as number) || 0,
    in_cents: (moves?.in_cents as number) || 0,
    out_cents: (moves?.out_cents as number) || 0,
    expected_cents:
      opening +
      ((cash.net_cents as number) || 0) +
      ((moves?.in_cents as number) || 0) -
      ((moves?.out_cents as number) || 0),
    by_method: methods,
    blockers: blockers!,
  };
}
