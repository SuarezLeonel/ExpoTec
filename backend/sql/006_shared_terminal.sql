ALTER TABLE sessions ADD COLUMN mode text NOT NULL DEFAULT 'management' CHECK(mode IN ('management','terminal'));
ALTER TABLE users ADD COLUMN pin_lookup text;
CREATE UNIQUE INDEX users_active_pin_lookup ON users(pin_lookup) WHERE active AND pin_lookup IS NOT NULL;
ALTER TABLE operations ADD COLUMN table_id uuid REFERENCES dining_tables(id);
INSERT INTO roles(name) VALUES('terminal') ON CONFLICT DO NOTHING;
INSERT INTO permissions(name) VALUES('terminal_view') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role,permission) VALUES('terminal','terminal_view') ON CONFLICT DO NOTHING;
CREATE INDEX operational_grants_session ON operational_grants(session_id);
CREATE INDEX operations_key ON operations(operation_key);
