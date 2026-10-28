import { one, rows, type DB } from '../database/db.js';
import type { AuthRequest } from './types.js';
import { config } from '../config/env.js';

export async function tableState(db: DB, tableId: string, cash: boolean) {
  const accounts = await rows<Record<string, unknown>>(
    db,
    "SELECT * FROM account_totals WHERE table_id=$1 AND status IN ('open','requested') ORDER BY created_at DESC",
    [tableId],
  );
  const accountIds = accounts.map((a) => a.id as string);
  let items: Record<string, unknown>[] = [];
  let payments: Record<string, unknown>[] = [];
  let refunds: Record<string, unknown>[] = [];
  let discounts: Record<string, unknown>[] = [];

  if (accountIds.length > 0) {
    items = await rows<Record<string, unknown>>(
      db,
      `SELECT i.*,coalesce((SELECT json_agg(json_build_object('id',a.addon_id,'name',a.name,'price_cents',a.price_cents)) FROM item_addons a WHERE a.item_id=i.id),'[]'::json) addons FROM item_totals i WHERE i.account_id=ANY($1::uuid[]) ORDER BY i.created_at`,
      [accountIds],
    );
    if (cash) {
      payments = await rows<Record<string, unknown>>(
        db,
        'SELECT * FROM payments WHERE account_id=ANY($1::uuid[]) ORDER BY created_at DESC',
        [accountIds],
      );
      refunds = await rows<Record<string, unknown>>(
        db,
        `SELECT r.*,coalesce((SELECT json_agg(pr) FROM product_returns pr WHERE pr.refund_id=r.id),'[]'::json) product_returns FROM refunds r WHERE r.account_id=ANY($1::uuid[]) ORDER BY r.created_at DESC`,
        [accountIds],
      );
    }
    discounts = await rows<Record<string, unknown>>(
      db,
      'SELECT * FROM discounts WHERE account_id=ANY($1::uuid[]) ORDER BY created_at DESC',
      [accountIds],
    );
  }

  const cashSessions = cash
    ? await rows<Record<string, unknown>>(
        db,
        "SELECT id,status,created_at FROM cash_sessions WHERE status='open' ORDER BY created_at DESC",
      )
    : [];

  const snapshot = {
    accounts,
    items,
    payments,
    refunds,
    discounts,
    cashSessions,
  };
  // JSON aggregates must retain the same integer safety as the pg bigint parser.
  function checkAmounts(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    for (const [key, field] of Object.entries(value)) {
      if (key.endsWith('_cents') && typeof field === 'number' && !Number.isSafeInteger(field))
        throw new Error('Importe fuera del rango exacto');
      checkAmounts(field);
    }
  }
  checkAmounts(snapshot);
  return snapshot;
}

export async function menu(db: DB) {
  return {
    categories: await rows(
      db,
      'SELECT c.id,c.name,c.parent_id,c.sort_order FROM categories c LEFT JOIN categories parent ON parent.id=c.parent_id WHERE c.active AND (c.parent_id IS NULL OR parent.active) ORDER BY c.sort_order,c.created_at,c.id',
    ),
    products: await rows(
      db,
      `SELECT p.id,p.category_id,p.name,p.description,p.price_cents,p.image_url,p.available,p.variant_group,p.variant_name,coalesce((SELECT json_agg(json_build_object('id',a.id,'name',a.name,'price_cents',a.price_cents) ORDER BY a.name) FROM product_addons pa JOIN addons a ON a.id=pa.addon_id WHERE pa.product_id=p.id AND a.active),'[]'::json) addons FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN categories parent ON parent.id=c.parent_id WHERE p.active AND p.visible_en_carta AND c.active AND (c.parent_id IS NULL OR parent.active) ORDER BY p.created_at,p.id`,
    ),
  };
}
export async function state(db: DB, auth: AuthRequest) {
  const terminal = auth.mode === 'terminal';
  const scope = terminal ? auth.grantTableId : undefined;
  const cash = auth.permissions.includes('cash');
  const admin = auth.permissions.includes('manage_users');
  const destination =
    auth.user.role === 'kitchen' ? 'kitchen' : auth.user.role === 'bar' ? 'bar' : null;
  return {
    user: auth.user,
    mode: auth.mode,
    ...(auth.operator ? { operator: auth.operator } : {}),
    permissions: auth.permissions,
    timezone: config.BRANCH_TIMEZONE,
    tables: await rows(
      db,
      terminal
        ? 'SELECT * FROM dining_tables WHERE active ORDER BY sector,label'
        : 'SELECT * FROM dining_tables ORDER BY sector,label',
    ),
    floorPlan: await one(db, 'SELECT published,version FROM floor_plan_state WHERE id=1'),
    ...(auth.permissions.includes('manage_tables')
      ? {
          floorPlanDraft: await one(
            db,
            'SELECT draft,draft_revision,version FROM floor_plan_state WHERE id=1',
          ),
        }
      : {}),
    accounts:
      terminal && !auth.operator
        ? await rows(
            db,
            "SELECT id,table_id,waiter_id,guests,status,version,created_at,updated_at FROM accounts WHERE status IN ('open','requested') ORDER BY created_at DESC",
          )
        : destination
          ? await rows(
              db,
              'SELECT a.id,a.table_id,a.waiter_id,a.guests,a.status,a.version,a.created_at,a.updated_at FROM accounts a WHERE EXISTS(SELECT 1 FROM items i WHERE i.account_id=a.id AND i.destination=$1) ORDER BY a.created_at DESC LIMIT 2000',
              [destination],
            )
          : await rows(
              db,
              "SELECT * FROM account_totals WHERE ($1::uuid IS NULL OR table_id=$1) AND (NOT $2::boolean OR status IN ('open','requested')) ORDER BY created_at DESC LIMIT 2000",
              [scope, terminal],
            ),
    items:
      terminal && !auth.operator
        ? []
        : await rows(
            db,
            `SELECT i.*,coalesce((SELECT json_agg(json_build_object('id',a.addon_id,'name',a.name,'price_cents',a.price_cents)) FROM item_addons a WHERE a.item_id=i.id),'[]'::json) addons FROM item_totals i JOIN accounts account ON account.id=i.account_id WHERE ($1::text IS NULL OR i.destination=$1) AND ($2::uuid IS NULL OR account.table_id=$2) AND (NOT $3::boolean OR account.status IN ('open','requested')) ORDER BY i.created_at`,
            [destination, scope, terminal],
          ),
    products: await rows(
      db,
      `SELECT p.*,coalesce((SELECT json_agg(pa.addon_id) FROM product_addons pa WHERE pa.product_id=p.id),'[]'::json) addon_ids FROM products p ORDER BY p.created_at,p.id`,
    ),
    categories: await rows(db, 'SELECT * FROM categories ORDER BY sort_order,created_at,id'),
    addons: await rows(db, 'SELECT * FROM addons ORDER BY created_at,id'),
    users: await rows(
      db,
      admin
        ? "SELECT id,username,name,role,active,created_at,updated_at,(pin_hash IS NOT NULL) pin_configured,(pin_lookup IS NOT NULL) pin_identifiable FROM users WHERE role<>'terminal' ORDER BY name"
        : "SELECT id,name,role,active,created_at FROM users WHERE active AND role<>'terminal' ORDER BY name",
    ),
    cashSessions: cash
      ? await rows(
          db,
          terminal
            ? "SELECT id,status,created_at FROM cash_sessions WHERE status='open' ORDER BY created_at DESC"
            : 'SELECT * FROM cash_sessions ORDER BY created_at DESC',
        )
      : [],
    cashMovements:
      cash && !terminal
        ? await rows(db, 'SELECT * FROM cash_movements ORDER BY created_at DESC')
        : [],
    payments: cash
      ? await rows(
          db,
          "SELECT p.* FROM payments p JOIN accounts a ON a.id=p.account_id WHERE ($1::uuid IS NULL OR a.table_id=$1) AND (NOT $2::boolean OR a.status IN ('open','requested')) ORDER BY p.created_at DESC",
          [scope, terminal],
        )
      : [],
    refunds: cash
      ? await rows(
          db,
          "SELECT r.*,coalesce((SELECT json_agg(pr) FROM product_returns pr WHERE pr.refund_id=r.id),'[]'::json) product_returns FROM refunds r JOIN accounts a ON a.id=r.account_id WHERE ($1::uuid IS NULL OR a.table_id=$1) AND (NOT $2::boolean OR a.status IN ('open','requested')) ORDER BY r.created_at DESC",
          [scope, terminal],
        )
      : [],
    discounts:
      destination || (terminal && !auth.operator)
        ? []
        : await rows(
            db,
            "SELECT d.* FROM discounts d JOIN accounts a ON a.id=d.account_id WHERE ($1::uuid IS NULL OR a.table_id=$1) AND (NOT $2::boolean OR a.status IN ('open','requested')) ORDER BY d.created_at DESC",
            [scope, terminal],
          ),
    printJobs: terminal
      ? []
      : await rows(
          db,
          'SELECT * FROM print_jobs WHERE ($1::text IS NULL OR destination=$1) ORDER BY created_at DESC',
          [destination],
        ),
    invoices:
      cash && !terminal ? await rows(db, 'SELECT * FROM invoices ORDER BY created_at DESC') : [],
    files: await rows(
      db,
      `SELECT id,name,kind,mime,user_id,entity_id,public,created_at FROM stored_files WHERE public OR $1 OR ($2 AND kind IN ('cash','account','invoice','ticket')) ORDER BY created_at DESC LIMIT 1000`,
      [!terminal && auth.permissions.includes('audit'), !terminal && cash],
    ),
  };
}
