CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE roles (name text PRIMARY KEY);
CREATE TABLE permissions (name text PRIMARY KEY);
CREATE TABLE role_permissions (role text NOT NULL REFERENCES roles(name), permission text NOT NULL REFERENCES permissions(name), PRIMARY KEY(role,permission));
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text NOT NULL UNIQUE CHECK(length(username) BETWEEN 3 AND 60),
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 100), role text NOT NULL REFERENCES roles(name),
 password_hash text NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE, csrf text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE password_resets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE demo_mailbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE auth_attempts (bucket text PRIMARY KEY, attempts integer NOT NULL CHECK(attempts > 0), started_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE CHECK(length(name) BETWEEN 2 AND 100), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE addons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE CHECK(length(name) BETWEEN 2 AND 100), price_cents integer NOT NULL CHECK(price_cents BETWEEN 0 AND 100000000), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid NOT NULL REFERENCES categories(id), name text NOT NULL CHECK(length(name) BETWEEN 2 AND 120), description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
 price_cents integer NOT NULL CHECK(price_cents BETWEEN 0 AND 100000000), image_url text NOT NULL DEFAULT '', destination text NOT NULL CHECK(destination IN ('kitchen','bar','none')),
 available boolean NOT NULL DEFAULT true, active boolean NOT NULL DEFAULT true, visible_en_carta boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category ON products(category_id);
CREATE TABLE product_addons (product_id uuid NOT NULL REFERENCES products(id), addon_id uuid NOT NULL REFERENCES addons(id), PRIMARY KEY(product_id,addon_id));
CREATE TABLE table_groups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE dining_tables (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), label text NOT NULL UNIQUE CHECK(length(label) BETWEEN 1 AND 30), capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 50), sector text NOT NULL CHECK(length(sector) BETWEEN 1 AND 50), x integer NOT NULL DEFAULT 0 CHECK(x BETWEEN 0 AND 2000), y integer NOT NULL DEFAULT 0 CHECK(y BETWEEN 0 AND 2000), active boolean NOT NULL DEFAULT true, group_id uuid REFERENCES table_groups(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), table_id uuid NOT NULL REFERENCES dining_tables(id), waiter_id uuid NOT NULL REFERENCES users(id), guests integer NOT NULL CHECK(guests BETWEEN 1 AND 100), status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','requested','closed','merged')), version integer NOT NULL DEFAULT 1 CHECK(version>0), merged_into uuid REFERENCES accounts(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz);
CREATE INDEX accounts_table_open ON accounts(table_id) WHERE status IN ('open','requested');
CREATE INDEX accounts_waiter ON accounts(waiter_id);
CREATE TABLE items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts(id), product_id uuid NOT NULL REFERENCES products(id), name text NOT NULL, description text NOT NULL, unit_cents integer NOT NULL CHECK(unit_cents>=0), quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100), notes text NOT NULL DEFAULT '' CHECK(length(notes)<=500), destination text NOT NULL CHECK(destination IN ('kitchen','bar','none')), status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','preparing','ready','delivered','void')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX items_account ON items(account_id);
CREATE INDEX items_queue ON items(destination,status) WHERE status IN ('sent','preparing','ready');
CREATE TABLE item_addons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES items(id), addon_id uuid NOT NULL REFERENCES addons(id), name text NOT NULL, price_cents integer NOT NULL CHECK(price_cents>=0), UNIQUE(item_id,addon_id));
CREATE TABLE order_sends (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts(id), user_id uuid NOT NULL REFERENCES users(id), destination text NOT NULL, kind text NOT NULL CHECK(kind IN ('new','correction','void')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE order_send_items (send_id uuid NOT NULL REFERENCES order_sends(id), item_id uuid NOT NULL REFERENCES items(id), snapshot jsonb NOT NULL, PRIMARY KEY(send_id,item_id));
CREATE TABLE discounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts(id), item_id uuid REFERENCES items(id), kind text NOT NULL CHECK(kind IN ('amount','percent')), value integer NOT NULL CHECK(value>0), amount_cents integer NOT NULL CHECK(amount_cents>0), base_cents integer NOT NULL CHECK(base_cents>=amount_cents), user_id uuid NOT NULL REFERENCES users(id), authorized_by uuid NOT NULL REFERENCES users(id), reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 300), created_at timestamptz NOT NULL DEFAULT now(), CHECK(kind<>'percent' OR value<=100));
CREATE UNIQUE INDEX discount_item_scope ON discounts(item_id) WHERE item_id IS NOT NULL;
CREATE UNIQUE INDEX discount_account_scope ON discounts(account_id) WHERE item_id IS NULL;
CREATE TABLE cash_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), opening_cents integer NOT NULL CHECK(opening_cents BETWEEN 0 AND 100000000), status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')), counted_cents integer CHECK(counted_cents>=0), expected_cents bigint, difference_cents bigint, closed_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz);
CREATE UNIQUE INDEX cash_one_open ON cash_sessions((status)) WHERE status='open';
CREATE TABLE cash_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cash_session_id uuid NOT NULL REFERENCES cash_sessions(id), user_id uuid NOT NULL REFERENCES users(id), kind text NOT NULL CHECK(kind IN ('in','out')), amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000), concept text NOT NULL CHECK(length(concept) BETWEEN 3 AND 300), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE payment_plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL UNIQUE REFERENCES accounts(id), parts integer NOT NULL CHECK(parts BETWEEN 2 AND 30), base_cents integer NOT NULL CHECK(base_cents>0), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts(id), cash_session_id uuid NOT NULL REFERENCES cash_sessions(id), user_id uuid NOT NULL REFERENCES users(id), amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000), method text NOT NULL CHECK(method IN ('cash','debit','credit','transfer')), received_cents integer NOT NULL CHECK(received_cents>=amount_cents), change_cents integer NOT NULL CHECK(change_cents=received_cents-amount_cents), plan_id uuid REFERENCES payment_plans(id), part integer, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(plan_id,part));
CREATE INDEX payments_account ON payments(account_id);
CREATE INDEX payments_cash ON payments(cash_session_id);
CREATE TABLE payment_allocations (payment_id uuid NOT NULL REFERENCES payments(id), item_id uuid NOT NULL REFERENCES items(id), quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100), amount_cents integer NOT NULL CHECK(amount_cents>0), PRIMARY KEY(payment_id,item_id));
CREATE TABLE refunds (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts(id), payment_id uuid NOT NULL REFERENCES payments(id), cash_session_id uuid NOT NULL REFERENCES cash_sessions(id), user_id uuid NOT NULL REFERENCES users(id), authorized_by uuid NOT NULL REFERENCES users(id), amount_cents integer NOT NULL CHECK(amount_cents>0), reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 300), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX refunds_payment ON refunds(payment_id);
CREATE INDEX refunds_account ON refunds(account_id);
CREATE TABLE product_returns (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), refund_id uuid NOT NULL REFERENCES refunds(id), item_id uuid NOT NULL REFERENCES items(id), quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE print_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), send_id uuid REFERENCES order_sends(id), account_id uuid REFERENCES accounts(id), destination text NOT NULL CHECK(destination IN ('kitchen','bar','receipt')), status text NOT NULL DEFAULT 'generated' CHECK(status IN ('generated','sent','confirmed','failed','uncertain')), content text NOT NULL, error text, copy_of uuid REFERENCES print_jobs(id), reason text, attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE print_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES print_jobs(id), user_id uuid NOT NULL REFERENCES users(id), state text NOT NULL, detail text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX print_jobs_status ON print_jobs(status);
CREATE TABLE invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts(id), user_id uuid NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','requested','issued','rejected','uncertain')), kind text NOT NULL CHECK(length(kind) BETWEEN 1 AND 40), recipient_name text NOT NULL CHECK(length(recipient_name) BETWEEN 2 AND 100), recipient_document text NOT NULL CHECK(length(recipient_document)<=20), amount_cents integer NOT NULL CHECK(amount_cents>=0), issuer_name text NOT NULL DEFAULT 'Sucursal ficticia Baguette', document_number text UNIQUE, disclaimer text NOT NULL DEFAULT 'Demostración. Sin validez fiscal', error text, attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX invoice_active_account ON invoices(account_id) WHERE status<>'rejected';
CREATE TABLE invoice_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES invoices(id), user_id uuid NOT NULL REFERENCES users(id), state text NOT NULL, detail text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE stored_files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, kind text NOT NULL CHECK(kind IN ('menu','audit','cash','account','invoice','ticket')), mime text NOT NULL, path text NOT NULL UNIQUE, user_id uuid REFERENCES users(id), entity_id uuid, public boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE file_deliveries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_id uuid NOT NULL REFERENCES stored_files(id), user_id uuid REFERENCES users(id), requested_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz);
CREATE TABLE operations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), operation_key uuid NOT NULL, action text NOT NULL, access_permission text REFERENCES permissions(name), content_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,operation_key));
CREATE TABLE audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), authorized_by uuid REFERENCES users(id), operation_id uuid, operation text NOT NULL, entity text NOT NULL, entity_id uuid, before_value jsonb, after_value jsonb, reason text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_created ON audit_events(created_at DESC);
CREATE INDEX audit_user ON audit_events(user_id,created_at DESC);
CREATE INDEX audit_entity ON audit_events(entity,entity_id);
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Registro inmutable: use operación compensatoria' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER immutable_payments BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER immutable_refunds BEFORE UPDATE OR DELETE ON refunds FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER immutable_discounts BEFORE UPDATE OR DELETE ON discounts FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER immutable_cash_movements BEFORE UPDATE OR DELETE ON cash_movements FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER immutable_product_returns BEFORE UPDATE OR DELETE ON product_returns FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER immutable_sends BEFORE UPDATE OR DELETE ON order_sends FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER immutable_send_items BEFORE UPDATE OR DELETE ON order_send_items FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE TRIGGER immutable_operations BEFORE UPDATE OR DELETE ON operations FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
CREATE VIEW item_totals AS SELECT i.*, (i.unit_cents+coalesce(a.addon_cents,0))::integer AS effective_unit_cents, (i.quantity*(i.unit_cents+coalesce(a.addon_cents,0)))::bigint AS line_cents FROM items i LEFT JOIN (SELECT item_id,sum(price_cents) addon_cents FROM item_addons GROUP BY item_id) a ON a.item_id=i.id;
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
