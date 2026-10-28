-- =============================================================================
-- EXPO TEC 2026 · SISTEMA DE GESTIÓN GASTRONÓMICA (CAFÉ)
-- Base de Datos Relacional: MySQL 8.0 (InnoDB, UTF-8)
-- Contraseña unificada de cuentas demo: DemoBaguette2026!
-- =============================================================================

DROP DATABASE IF EXISTS cafe_demo;
CREATE DATABASE cafe_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cafe_demo;

SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- 0. TABLA DE MIGRACIONES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(255) PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (name) VALUES ('001_schema.sql'), ('002_seed.sql') ON DUPLICATE KEY UPDATE name=name;

-- -----------------------------------------------------------------------------
-- 1. ROLES Y PERMISOS (SEGMENTACIÓN JERÁRQUICA)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  name VARCHAR(50) PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  name VARCHAR(50) PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role VARCHAR(50) NOT NULL,
  permission VARCHAR(50) NOT NULL,
  PRIMARY KEY (role, permission),
  FOREIGN KEY (role) REFERENCES roles(name) ON DELETE CASCADE,
  FOREIGN KEY (permission) REFERENCES permissions(name) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 2. USUARIOS Y AUTENTICACIÓN (1 CUENTA POR ROL)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  username VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL,
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  pin_hash VARCHAR(255) NULL,
  pin_lookup VARCHAR(255) NULL,
  pin_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (role) REFERENCES roles(name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  csrf VARCHAR(128) NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'management',
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_resets (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS demo_mailbox (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  token VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_attempts (
  bucket VARCHAR(128) PRIMARY KEY,
  attempts INT NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 3. CATÁLOGO, PRODUCTOS Y ADICIONALES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  parent_id VARCHAR(36) NULL,
  name VARCHAR(100) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS addons (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(100) NOT NULL UNIQUE,
  price_cents INT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  category_id VARCHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  price_cents INT NOT NULL,
  image_url VARCHAR(255) NOT NULL DEFAULT '',
  destination ENUM('kitchen', 'bar', 'none') NOT NULL,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  visible_en_carta BOOLEAN NOT NULL DEFAULT TRUE,
  variant_group VARCHAR(100) NOT NULL DEFAULT '',
  variant_name VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_addons (
  product_id VARCHAR(36) NOT NULL,
  addon_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (product_id, addon_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 4. MESAS Y PLANO DEL SALÓN
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS table_groups (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dining_tables (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  group_id VARCHAR(36) NULL,
  label VARCHAR(50) NOT NULL,
  capacity INT NOT NULL,
  sector VARCHAR(50) NOT NULL,
  x INT NOT NULL DEFAULT 0,
  y INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  shape VARCHAR(20) NOT NULL DEFAULT 'square',
  width INT NOT NULL DEFAULT 60,
  height INT NOT NULL DEFAULT 60,
  rotation INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES table_groups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS floor_plan_state (
  id INT PRIMARY KEY DEFAULT 1,
  draft JSON NOT NULL,
  published JSON NOT NULL,
  version INT NOT NULL DEFAULT 1,
  draft_revision INT NOT NULL DEFAULT 1,
  updated_by VARCHAR(36) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 5. COMANDAS, CUENTAS E ÍTEMS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  table_id VARCHAR(36) NOT NULL,
  waiter_id VARCHAR(36) NOT NULL,
  guests INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  version INT NOT NULL DEFAULT 1,
  closed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (table_id) REFERENCES dining_tables(id),
  FOREIGN KEY (waiter_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS items (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  account_id VARCHAR(36) NOT NULL,
  product_id VARCHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  unit_cents INT NOT NULL,
  quantity INT NOT NULL,
  notes TEXT,
  destination VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  discount_kind VARCHAR(20) NULL,
  discount_value VARCHAR(50) NULL,
  discount_amount_cents INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS item_addons (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  item_id VARCHAR(36) NOT NULL,
  addon_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  price_cents INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (addon_id) REFERENCES addons(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_sends (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  account_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  destination VARCHAR(20) NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'order',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS print_jobs (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  send_id VARCHAR(36) NULL,
  account_id VARCHAR(36) NOT NULL,
  destination VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'generated',
  content TEXT NOT NULL,
  copy_of VARCHAR(36) NULL,
  reason VARCHAR(255) NULL,
  error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 6. CAJA, PAGOS, DESCUENTOS Y REINTEGROS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_sessions (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  opening_cents BIGINT NOT NULL DEFAULT 0,
  counted_cents BIGINT NULL,
  expected_cents BIGINT NULL,
  difference_cents BIGINT NULL,
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP NULL,
  closed_by VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (closed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cash_movements (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  cash_session_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  kind ENUM('in', 'out') NOT NULL,
  amount_cents BIGINT NOT NULL,
  concept VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_plans (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  account_id VARCHAR(36) NOT NULL,
  parts INT NOT NULL,
  base_cents BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  account_id VARCHAR(36) NOT NULL,
  cash_session_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  amount_cents BIGINT NOT NULL,
  method VARCHAR(20) NOT NULL,
  received_cents BIGINT NOT NULL DEFAULT 0,
  change_cents BIGINT NOT NULL DEFAULT 0,
  plan_id VARCHAR(36) NULL,
  part INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (plan_id) REFERENCES payment_plans(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discounts (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  account_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NULL,
  kind VARCHAR(20) NOT NULL,
  value VARCHAR(50) NOT NULL,
  amount_cents BIGINT NOT NULL,
  base_cents BIGINT NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  authorized_by VARCHAR(36) NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (authorized_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refunds (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  account_id VARCHAR(36) NOT NULL,
  payment_id VARCHAR(36) NOT NULL,
  cash_session_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  authorized_by VARCHAR(36) NOT NULL,
  amount_cents BIGINT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_id) REFERENCES payments(id),
  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (authorized_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_returns (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  refund_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  quantity INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  account_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  kind VARCHAR(50) NOT NULL,
  recipient_name VARCHAR(100) NOT NULL,
  recipient_document VARCHAR(50) NOT NULL DEFAULT '',
  amount_cents BIGINT NOT NULL,
  document_number VARCHAR(50) NULL,
  details JSON NULL,
  error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 7. AUDITORÍA, ARCHIVOS Y TERMINAL COMPARTIDA
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NULL,
  authorized_by VARCHAR(36) NULL,
  operation_id VARCHAR(100) NULL,
  operation VARCHAR(100) NOT NULL,
  entity VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NULL,
  before_value JSON NULL,
  after_value JSON NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stored_files (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  kind VARCHAR(50) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  path VARCHAR(255) NOT NULL,
  user_id VARCHAR(36) NULL,
  entity_id VARCHAR(36) NULL,
  public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS file_deliveries (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  file_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  delivered_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_id) REFERENCES stored_files(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operational_grants (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  session_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  table_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  grant_value VARCHAR(128) NOT NULL DEFAULT '',
  pin_version INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (table_id) REFERENCES dining_tables(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS binary_assets (
  path VARCHAR(255) PRIMARY KEY,
  content LONGBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operations (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id VARCHAR(36) NOT NULL,
  operation_key VARCHAR(36) NOT NULL,
  action VARCHAR(100) NOT NULL,
  access_permission VARCHAR(50) NULL,
  content_hash VARCHAR(255) NOT NULL,
  result JSON NOT NULL,
  table_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_operations_user_key (user_id, operation_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_send_items (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  send_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  snapshot JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (send_id) REFERENCES order_sends(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  payment_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  quantity INT NOT NULL,
  amount_cents BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoice_events (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  invoice_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NULL,
  state VARCHAR(50) NOT NULL,
  detail VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS print_events (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  job_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NULL,
  state VARCHAR(50) NOT NULL,
  detail VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES print_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 8. VISTAS FINANCIERAS (CÁLCULO DINÁMICO DE TOTALES)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW item_totals AS
SELECT i.*,
 (i.unit_cents + COALESCE(a.addon_cents, 0)) AS effective_unit_cents,
 (i.quantity * (i.unit_cents + COALESCE(a.addon_cents, 0))) AS line_cents
FROM items i
LEFT JOIN (
  SELECT item_id, SUM(price_cents) AS addon_cents
  FROM item_addons
  GROUP BY item_id
) a ON a.item_id = i.id;

CREATE OR REPLACE VIEW account_totals AS
SELECT a.*,
 COALESCE(i.subtotal, 0) AS subtotal_cents,
 COALESCE(d.discount, 0) AS discount_cents,
 COALESCE(r.refunded, 0) AS refunded_cents,
 (COALESCE(i.subtotal, 0) - COALESCE(d.discount, 0)) AS original_total_cents,
 (COALESCE(i.subtotal, 0) - COALESCE(d.discount, 0) - COALESCE(r.refunded, 0)) AS total_cents,
 (COALESCE(p.paid, 0) - COALESCE(r.refunded, 0)) AS paid_cents,
 (COALESCE(i.subtotal, 0) - COALESCE(d.discount, 0) - COALESCE(p.paid, 0)) AS balance_cents
FROM accounts a
LEFT JOIN (
  SELECT account_id, SUM(line_cents) AS subtotal
  FROM item_totals
  WHERE status <> 'void'
  GROUP BY account_id
) i ON i.account_id = a.id
LEFT JOIN (
  SELECT account_id, SUM(amount_cents) AS discount
  FROM discounts
  GROUP BY account_id
) d ON d.account_id = a.id
LEFT JOIN (
  SELECT account_id, SUM(amount_cents) AS paid
  FROM payments
  GROUP BY account_id
) p ON p.account_id = a.id
LEFT JOIN (
  SELECT account_id, SUM(amount_cents) AS refunded
  FROM refunds
  GROUP BY account_id
) r ON r.account_id = a.id;

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- 9. DATOS INICIALES (DEMO EXPO TEC 2026)
-- -----------------------------------------------------------------------------
-- Roles y Permisos
INSERT IGNORE INTO roles(name) VALUES ('admin'),('cashier'),('waiter'),('kitchen'),('bar'),('terminal');

INSERT IGNORE INTO permissions(name) VALUES 
('operate'),('prepare_kitchen'),('prepare_bar'),('cash'),('discount'),
('refund'),('sensitive_void'),('manage_catalog'),('manage_tables'),
('manage_users'),('audit'),('settings'),('terminal_view');

INSERT IGNORE INTO role_permissions(role, permission) SELECT 'admin', name FROM permissions;

INSERT IGNORE INTO role_permissions(role, permission) VALUES
('cashier','operate'),('cashier','cash'),('cashier','discount'),('cashier','refund'),('cashier','sensitive_void'),
('waiter','operate'),
('kitchen','prepare_kitchen'),
('bar','prepare_bar'),
('terminal','terminal_view');

-- Usuarios Oficiales (Contraseña: DemoBaguette2026!)
INSERT INTO users(id, username, name, role, password_hash, active, pin_hash, pin_lookup, pin_version) VALUES
('50000000-0000-4000-8000-000000000001','admin','Ana Encargada','admin','scrypt$131072$8$1$a2c84353f1dda5a7c23ee3eac27fdda4$524afa126bcd957aa89db47e08b56066ea3445dbf08beb5db54496025f40cd2f9d2985dd3ed93e1cdf9f65882a586f4530d4f5f5e19e5f63f2c10772df6e85da',true,'scrypt$131072$8$1$74c04c2ce30fdbee838b0c95abbcc1fa$725a940e6a1e15d45e2083012774d02b1e111d7fa75a39ceb227ad308d69f53d15e48726d33073341e88413ce838a6d1ffeb9220b8bdb65dc569f45302c611aa','1a72a0e66ee7ee3f125244078ffb141daad1dd0d824a439ee22aac718d7a4ef0',1),
('50000000-0000-4000-8000-000000000002','caja','Carla Cajera','cashier','scrypt$131072$8$1$a2c84353f1dda5a7c23ee3eac27fdda4$524afa126bcd957aa89db47e08b56066ea3445dbf08beb5db54496025f40cd2f9d2985dd3ed93e1cdf9f65882a586f4530d4f5f5e19e5f63f2c10772df6e85da',true,'scrypt$131072$8$1$c87d9a2d81b5128061f546e3d8c8179b$88d3680b119abcaaead972c64f98e19d60a7663857eaa80f4ebc40b1c3c27150943a50a8d073037f2b5f9ce5b2e9096425a12bd85d690b3d82077f59e8a339d1','f58aef36d7d6fc575dbe4e6abe97faf469ee4db6f59c7eb219295da2c6c5bf80',1),
('50000000-0000-4000-8000-000000000003','mozo','Martín Camarero','waiter','scrypt$131072$8$1$a2c84353f1dda5a7c23ee3eac27fdda4$524afa126bcd957aa89db47e08b56066ea3445dbf08beb5db54496025f40cd2f9d2985dd3ed93e1cdf9f65882a586f4530d4f5f5e19e5f63f2c10772df6e85da',true,'scrypt$131072$8$1$eb9a623768eb0e93fb0f84618926af87$4cff7bab16dcee5b4388e02f44fc94f97977f52822162f677d2f2aca06015aefcf73dd4dbec51767cd2d5473269d55b03c06533de58548b4a7a8ceaea2a36a03','09f919857a06dd2de2b86ede1939b76fe96ec909ef09a3749c58f5c0ef0d222f',1),
('50000000-0000-4000-8000-000000000004','cocina','Lucía Cocina','kitchen','scrypt$131072$8$1$a2c84353f1dda5a7c23ee3eac27fdda4$524afa126bcd957aa89db47e08b56066ea3445dbf08beb5db54496025f40cd2f9d2985dd3ed93e1cdf9f65882a586f4530d4f5f5e19e5f63f2c10772df6e85da',true,'scrypt$131072$8$1$eef3334df7b5d8b3812351273d6fe913$abb408f5913bba25eb99895ebe89e5f6c3083e50f37ec48472b0cb2ef66a65d84d92a6d6138c158299425d0c3272ea7d62b192696355eda02ea2550904ac84e9','3433eb2077b46e1124318d045dfe0f82280fe6f14cc0b64012cd19c5b5d2b4ee',1),
('50000000-0000-4000-8000-000000000005','bar','Bruno Bar','bar','scrypt$131072$8$1$a2c84353f1dda5a7c23ee3eac27fdda4$524afa126bcd957aa89db47e08b56066ea3445dbf08beb5db54496025f40cd2f9d2985dd3ed93e1cdf9f65882a586f4530d4f5f5e19e5f63f2c10772df6e85da',true,'scrypt$131072$8$1$e786d450571343375d5334739b2f7621$ca65ffc9185a5784e2e10a244be550dcdd6df51488a0b6d9e296ceb1e4dec2b2a90c04c8a5e42ce7e07e1a3fd90d26fc220f164d235cfbb1c23c99d815921e72','fef1d10189d530bcfdccc4f5397541036269258d510a47a2b7f2fb6c70e8d516',1),
('50000000-0000-4000-8000-000000000006','moza','María Camarera','waiter','scrypt$131072$8$1$a2c84353f1dda5a7c23ee3eac27fdda4$524afa126bcd957aa89db47e08b56066ea3445dbf08beb5db54496025f40cd2f9d2985dd3ed93e1cdf9f65882a586f4530d4f5f5e19e5f63f2c10772df6e85da',true,'scrypt$131072$8$1$26fd0fca564ff647cbceb3db9741be01$2279ee639c7608e0eadd915a056854ff4234f269accf9dbd9c825f86cdcc6a167baea2578174286ef248b4d8071ff9a143a27babd05afc7f62c8cc96db9577cb','ff0e36fd35e21037ab2018e6f8b3e37b9adc962ec1fb5a1d46b99a545ad74fd8',1),
('50000000-0000-4000-8000-000000000007','terminal.demo','Terminal compartida','terminal','scrypt$131072$8$1$a2c84353f1dda5a7c23ee3eac27fdda4$524afa126bcd957aa89db47e08b56066ea3445dbf08beb5db54496025f40cd2f9d2985dd3ed93e1cdf9f65882a586f4530d4f5f5e19e5f63f2c10772df6e85da',true,NULL,NULL,0)
ON DUPLICATE KEY UPDATE name=VALUES(name), password_hash=VALUES(password_hash), active=VALUES(active);

-- Categorías
INSERT IGNORE INTO categories(id, name, sort_order) VALUES
('11000000-0000-4000-8000-000000000001','Cafetería',10),
('11000000-0000-4000-8000-000000000002','Desayunos',20),
('10000000-0000-4000-8000-000000000002','Cocina',30),
('10000000-0000-4000-8000-000000000003','Dulces',40),
('11000000-0000-4000-8000-000000000005','Bebidas',50);

INSERT IGNORE INTO categories(id, name, parent_id, sort_order) VALUES
('10000000-0000-4000-8000-000000000001','Cafés clásicos','11000000-0000-4000-8000-000000000001',11),
('10000000-0000-4000-8000-000000000004','Aguas y gaseosas','11000000-0000-4000-8000-000000000005',51);

-- Adicionales
INSERT IGNORE INTO addons(id, name, price_cents) VALUES 
('20000000-0000-4000-8000-000000000001','Leche vegetal',80000),
('20000000-0000-4000-8000-000000000002','Extra queso',100000),
('20000000-0000-4000-8000-000000000003','Extra huevo',120000);

-- Productos
INSERT IGNORE INTO products(id,category_id,name,description,price_cents,destination,available,active,visible_en_carta,variant_group,variant_name) VALUES
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Café con leche','Ejemplo de café expreso con leche vaporizada.',350000,'bar',true,true,true,'Café','Con leche'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Tostado de jamón y queso','Pan tostado crocante con abundante jamón cocido y queso derretido.',650000,'kitchen',true,true,true,'',''),
('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','Medialuna','Medialuna tradicional de manteca artesanal.',180000,'none',true,true,true,'',''),
('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004','Limonada fresca','Limonada natural exprimida con menta y jengibre.',400000,'bar',true,true,true,'',''),
('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','Sándwich especial gourmet','Ciabatta con jamón crudo, rúcula fresca y queso brie.',850000,'kitchen',true,true,true,'',''),
('30000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','Café expreso doble','Doble carga de café espresso de especialidad tostado local.',320000,'bar',true,true,true,'Café','Doble');

-- Relaciones Producto - Adicional
INSERT IGNORE INTO product_addons(product_id, addon_id) VALUES
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002'),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003');

-- Mesas del Salón y Patio
INSERT IGNORE INTO dining_tables(id,label,capacity,sector,x,y,shape,width,height,rotation) VALUES
('40000000-0000-4000-8000-000000000001','1',2,'Salón',80,80,'square',70,70,0),
('40000000-0000-4000-8000-000000000002','2',4,'Salón',260,80,'rectangular',100,70,0),
('40000000-0000-4000-8000-000000000003','3',4,'Salón',440,80,'rectangular',100,70,0),
('40000000-0000-4000-8000-000000000004','4',2,'Salón',80,240,'square',70,70,0),
('40000000-0000-4000-8000-000000000005','5',6,'Patio',260,240,'rectangular',120,80,0),
('40000000-0000-4000-8000-000000000006','6',4,'Patio',440,240,'round',80,80,0);

-- Plano del Salón
INSERT INTO floor_plan_state(id, draft, published, version, draft_revision) VALUES
(1,
 JSON_OBJECT(
   'tables', JSON_ARRAY(
     JSON_OBJECT('id','40000000-0000-4000-8000-000000000001','label','1','capacity',2,'sector','Salón','x',80,'y',80,'shape','square','width',70,'height',70,'rotation',0,'active',true),
     JSON_OBJECT('id','40000000-0000-4000-8000-000000000002','label','2','capacity',4,'sector','Salón','x',260,'y',80,'shape','rectangular','width',100,'height',70,'rotation',0,'active',true),
     JSON_OBJECT('id','40000000-0000-4000-8000-000000000003','label','3','capacity',4,'sector','Salón','x',440,'y',80,'shape','rectangular','width',100,'height',70,'rotation',0,'active',true),
     JSON_OBJECT('id','40000000-0000-4000-8000-000000000004','label','4','capacity',2,'sector','Salón','x',80,'y',240,'shape','square','width',70,'height',70,'rotation',0,'active',true),
     JSON_OBJECT('id','40000000-0000-4000-8000-000000000005','label','5','capacity',6,'sector','Patio','x',260,'y',240,'shape','rectangular','width',120,'height',80,'rotation',0,'active',true),
     JSON_OBJECT('id','40000000-0000-4000-8000-000000000006','label','6','capacity',4,'sector','Patio','x',440,'y',240,'shape','round','width',80,'height',80,'rotation',0,'active',true)
   ),
   'elements', JSON_ARRAY()
 ),
 JSON_OBJECT(
   'tables', JSON_ARRAY(
     JSON_OBJECT('id','40000000-0000-4000-8000-000000000001','label','1','capacity',2,'sector','Salón','x',80,'y',80,'shape','square','width',70,'height',70,'rotation',0,'active',true),
     JSON_OBJECT('id','40000000-0000-4000-8000-000000000002','label','2','capacity',4,'sector','Salón','x',260,'y',80,'shape','rectangular','width',100,'height',70,'rotation',0,'active',true),
     JSON_OBJECT('id','40000000-0000-4000-8000-000000000003','label','3','capacity',4,'sector','Salón','x',440,'y',80,'shape','rectangular','width',100,'height',70,'rotation',0,'active',true),
     JSON_OBJECT('id','40000000-0000-4000-8000-000000000004','label','4','capacity',2,'sector','Salón','x',80,'y',240,'shape','square','width',70,'height',70,'rotation',0,'active',true),
     JSON_OBJECT('id','40000000-0000-4000-8000-000000000005','label','5','capacity',6,'sector','Patio','x',260,'y',240,'shape','rectangular','width',120,'height',80,'rotation',0,'active',true),
     JSON_OBJECT('id','40000000-0000-4000-8000-000000000006','label','6','capacity',4,'sector','Patio','x',440,'y',240,'shape','round','width',80,'height',80,'rotation',0,'active',true)
   ),
   'elements', JSON_ARRAY()
 ),
 1,
 1
)
ON DUPLICATE KEY UPDATE draft=VALUES(draft), published=VALUES(published);

-- Turno de Caja Abierto
INSERT IGNORE INTO cash_sessions(id, user_id, opening_cents, status) VALUES
('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',10000000,'open');

-- Cuentas de Ejemplo para el Salón
INSERT IGNORE INTO accounts(id, table_id, waiter_id, guests, status, closed_at) VALUES
('70000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003',2,'open',NULL),
('70000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000006',3,'requested',NULL),
('70000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003',2,'closed',NOW());

-- Ítems en curso (Demostración de estados: enviado, listo en cocina, entregado)
INSERT IGNORE INTO items(id, account_id, product_id, name, description, unit_cents, quantity, notes, destination, status) VALUES
('80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Café con leche','Ejemplo de café expreso con leche vaporizada.',350000,2,'Uno sin azúcar','bar','sent'),
('80000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','Tostado de jamón y queso','Pan tostado crocante con abundante jamón cocido y queso derretido.',650000,1,'Bien tostado','kitchen','ready'),
('80000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','Medialuna','Medialuna tradicional de manteca artesanal.',180000,2,'','none','delivered'),
('80000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004','Limonada fresca','Limonada natural exprimida con menta y jengibre.',400000,3,'','bar','delivered');

INSERT IGNORE INTO item_addons(id, item_id, addon_id, name, price_cents) VALUES
('81000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Leche vegetal',80000);

INSERT IGNORE INTO payments(id, account_id, cash_session_id, user_id, amount_cents, method, received_cents, change_cents) VALUES
('90000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',400000,'debit',400000,0);

INSERT IGNORE INTO audit_events(id, user_id, operation, entity, reason) VALUES
('c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','demo.seed','demo','Datos iniciales MySQL para ExpoTec 2026.');
