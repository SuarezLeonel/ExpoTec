DROP VIEW account_totals;
DROP VIEW item_totals;
ALTER TABLE discounts ALTER COLUMN base_cents TYPE bigint;
ALTER TABLE discounts ALTER COLUMN amount_cents TYPE bigint;
ALTER TABLE payment_plans ALTER COLUMN base_cents TYPE bigint;
ALTER TABLE invoices ALTER COLUMN amount_cents TYPE bigint;
CREATE VIEW item_totals AS SELECT i.*, (i.unit_cents+coalesce(a.addon_cents,0))::bigint AS effective_unit_cents, (i.quantity*(i.unit_cents+coalesce(a.addon_cents,0)))::bigint AS line_cents FROM items i LEFT JOIN (SELECT item_id,sum(price_cents) addon_cents FROM item_addons GROUP BY item_id) a ON a.item_id=i.id;
CREATE VIEW account_totals AS
SELECT a.*, coalesce(i.subtotal,0)::bigint subtotal_cents, coalesce(d.discount,0)::bigint discount_cents, coalesce(r.refunded,0)::bigint refunded_cents,
 (coalesce(i.subtotal,0)-coalesce(d.discount,0))::bigint original_total_cents,
 (coalesce(i.subtotal,0)-coalesce(d.discount,0)-coalesce(r.refunded,0))::bigint total_cents,
 (coalesce(p.paid,0)-coalesce(r.refunded,0))::bigint paid_cents,
 (coalesce(i.subtotal,0)-coalesce(d.discount,0)-coalesce(p.paid,0))::bigint balance_cents
FROM accounts a
LEFT JOIN (SELECT account_id,sum(line_cents) subtotal FROM item_totals WHERE status<>'void' GROUP BY account_id) i ON i.account_id=a.id
LEFT JOIN (SELECT account_id,sum(amount_cents) discount FROM discounts GROUP BY account_id) d ON d.account_id=a.id
LEFT JOIN (SELECT account_id,sum(amount_cents) paid FROM payments GROUP BY account_id) p ON p.account_id=a.id
LEFT JOIN (SELECT account_id,sum(amount_cents) refunded FROM refunds GROUP BY account_id) r ON r.account_id=a.id;
