ALTER TABLE users ADD COLUMN pin_hash text;
ALTER TABLE users ADD COLUMN pin_version integer NOT NULL DEFAULT 0;
CREATE TABLE operational_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  pin_version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operational_grants_expiry ON operational_grants(expires_at);
