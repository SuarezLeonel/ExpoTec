ALTER TABLE invoices ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb;
