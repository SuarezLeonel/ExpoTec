import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Account, Item } from '../src/modules/types.js';

assert.ok(process.env.TEST_DATABASE_URL, 'Configurá TEST_DATABASE_URL para PostgreSQL de pruebas.');
assert.ok(
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(process.env.TEST_DATABASE_URL).hostname),
  'Las pruebas de integración solo pueden restaurar PostgreSQL local.',
);
assert.equal(
  new URL(process.env.TEST_DATABASE_URL).pathname,
  '/baguette_test',
  'Las pruebas solo restauran la base baguette_test.',
);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'true';
process.env.STORAGE_DIR = path.resolve('storage-test');
const { pool, transaction } = await import('../src/database/db.js');
const { migrate } = await import('../src/database/migrate.js');
const { seed } = await import('../src/database/seed.js');
const { createApp } = await import('../src/app.js');
const { config } = await import('../src/config/env.js');

type Row = Record<string, unknown>;
interface Session {
  cookie: string;
  csrf: string;
  username?: string;
  grants?: Record<string, string>;
  mode?: 'terminal' | 'management';
  operationToken?: string;
}
interface ApiResult<T> {
  status: number;
  body: T;
  headers: Headers;
}
interface CommandResult<T = Row> {
  result: T;
  operation_id: string;
  replayed: boolean;
}
interface State {
  mode?: string;
  operator?: Row;
  permissions: string[];
  users: Row[];
  tables: Row[];
  accounts: Account[];
  items: Item[];
  products: Row[];
  cashSessions: Row[];
  cashMovements: Row[];
  payments: Row[];
  refunds: Row[];
  discounts: Row[];
  printJobs: Row[];
  invoices: Row[];
  files: Row[];
}
const table = '40000000-0000-4000-8000-000000000001';
const table2 = '40000000-0000-4000-8000-000000000002';
const waiter = '50000000-0000-4000-8000-000000000003';
const coffee = '30000000-0000-4000-8000-000000000001';
const pastry = '30000000-0000-4000-8000-000000000003';
let server: Server;
let url: string;
async function api<T = Row>(
  route: string,
  body: unknown = {},
  session?: Session,
  key?: string,
  skipPin = false,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: config.origins[0]!,
  };
  if (session) {
    headers.Cookie = session.cookie;
    headers['X-CSRF-Token'] = session.csrf;
    if (session.mode === 'terminal') headers['X-Session-Mode'] = 'terminal';
    if (session.operationToken) headers['X-Operation-Token'] = session.operationToken;
  }
  if (key) headers['Idempotency-Key'] = key;
  if (
    !skipPin &&
    session?.mode !== 'terminal' &&
    session?.username &&
    [
      'commands/account.open',
      'commands/item.add',
      'commands/item.edit',
      'commands/order.send',
    ].includes(route)
  ) {
    const data = body as Row;
    const tableId = route.endsWith('account.open')
      ? data.table_id
      : typeof data.account_id === 'string' && /^[a-f0-9-]{36}$/i.test(data.account_id)
        ? (await pool.query('SELECT table_id FROM accounts WHERE id=$1', [data.account_id])).rows[0]
            ?.table_id
        : undefined;
    if (tableId && ['admin', 'caja', 'mozo', 'moza'].includes(session.username)) {
      session.grants ||= {};
      if (!session.grants[String(tableId)]) {
        const pin = (
          { admin: '4101', caja: '4202', mozo: '4303', moza: '4606' } as Record<string, string>
        )[session.username];
        const granted = await api<{ token: string }>(
          'auth/operational-pin',
          { table_id: tableId, pin },
          session,
        );
        if (granted.status === 200) session.grants[String(tableId)] = granted.body.token;
      }
      if (session.grants[String(tableId)])
        headers['X-Operation-Token'] = session.grants[String(tableId)]!;
    }
  }
  const response = await fetch(`${url}/api/${route}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as T, headers: response.headers };
}
async function login(username = 'admin', password = config.DEMO_PASSWORD!): Promise<Session> {
  const result = await api<{ csrf: string }>('auth/login', { username, password });
  assert.equal(result.status, 200);
  const cookie = result.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  return { cookie: cookie.split(';')[0]!, csrf: result.body.csrf, username, grants: {} };
}
async function terminal(): Promise<Session> {
  const result = await api<{ csrf: string; mode: string; user: Row; permissions: string[] }>(
    'auth/terminal',
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.mode, 'terminal');
  assert.equal(result.body.user.role, 'terminal');
  assert.deepEqual(result.body.permissions, ['terminal_view']);
  const cookie = result.headers.get('set-cookie')!;
  assert.match(cookie, /^baguette_terminal=/);
  return { cookie: cookie.split(';')[0]!, csrf: result.body.csrf, mode: 'terminal' };
}
async function identify(session: Session, pin = '4303', tableId = table) {
  const result = await api<{ token: string; operator: Row; permissions: string[] }>(
    'auth/operational-pin',
    { table_id: tableId, pin },
    session,
  );
  assert.equal(result.status, 200, JSON.stringify(result.body));
  session.operationToken = result.body.token;
  return result.body;
}
async function command<T = Row>(
  session: Session,
  action: string,
  body: unknown,
  expected = 200,
  key = randomUUID(),
) {
  const result = await api<CommandResult<T> & { error: { code: string } }>(
    `commands/${action}`,
    body,
    session,
    key,
  );
  assert.equal(result.status, expected, `${action}: ${JSON.stringify(result.body)}`);
  return { ...result.body, key };
}
async function state(session: Session): Promise<State> {
  const result = await api<State>('state', {}, session);
  assert.equal(result.status, 200);
  return result.body;
}
async function current(session: Session, accountId: string): Promise<Account> {
  return (await state(session)).accounts.find((a) => a.id === accountId)!;
}
async function open(session: Session, tableId = table): Promise<Account> {
  return (
    await command<Account>(session, 'account.open', {
      table_id: tableId,
      guests: 2,
      waiter_id: waiter,
    })
  ).result;
}
async function add(
  session: Session,
  accountId: string,
  productId = pastry,
  quantity = 1,
  addonIds: string[] = [],
) {
  const account = await current(session, accountId);
  return (
    await command<{ item: Item; account: Account }>(session, 'item.add', {
      account_id: accountId,
      version: account.version,
      product_id: productId,
      quantity,
      notes: 'Prueba',
      addon_ids: addonIds,
    })
  ).result;
}
async function sendOrder(session: Session, accountId: string) {
  const value = await state(session);
  const ids = value.items
    .filter((i) => i.account_id === accountId && i.status === 'draft')
    .map((i) => i.id);
  if (ids.length)
    await command(session, 'order.send', {
      account_id: accountId,
      version: (await current(session, accountId)).version,
      item_ids: ids,
    });
  const sent = await state(session);
  assert.ok(
    sent.items
      .filter((item) => item.account_id === accountId)
      .every((item) => item.status === 'sent'),
  );
}
async function pay(session: Session, accountId: string, amount?: number, method = 'cash') {
  const value = await current(session, accountId);
  return command<{ payment: Row; account: Account }>(session, 'payment.add', {
    account_id: accountId,
    version: value.version,
    amount_cents: amount ?? value.balance_cents,
    method,
  });
}
before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await migrate();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(async () => {
  await pool.query(
    'TRUNCATE users,categories,addons,dining_tables,table_groups,auth_attempts RESTART IDENTITY CASCADE',
  );
  await seed(undefined, false);
});
after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test('PIN en caché conserva los controles vigentes de empleado, mesa, permisos y sesión', async () => {
  const shared = await terminal();
  await identify(shared);
  await identify(shared);
  await pool.query('UPDATE users SET active=false WHERE id=$1', [waiter]);
  const denied = await api('auth/operational-pin', { table_id: table, pin: '4303' }, shared);
  assert.equal(denied.status, 403);
  assert.equal((denied.body.error as Row).code, 'PIN_INVALID');
  await pool.query('UPDATE users SET active=true WHERE id=$1', [waiter]);
  await pool.query('UPDATE dining_tables SET active=false WHERE id=$1', [table]);
  assert.equal(
    (await api('auth/operational-pin', { table_id: table, pin: '4303' }, shared)).status,
    404,
  );
  await pool.query('UPDATE dining_tables SET active=true WHERE id=$1', [table]);
  try {
    await pool.query("DELETE FROM role_permissions WHERE role='waiter' AND permission='operate'");
    const forbidden = await api('auth/operational-pin', { table_id: table, pin: '4303' }, shared);
    assert.equal(forbidden.status, 403);
    assert.equal((forbidden.body.error as Row).code, 'FORBIDDEN');
  } finally {
    await pool.query(
      "INSERT INTO role_permissions(role,permission) VALUES('waiter','operate') ON CONFLICT DO NOTHING",
    );
  }
  await identify(shared);
  await api('auth/logout', {}, shared);
  assert.equal(
    (await api('auth/operational-pin', { table_id: table, pin: '4303' }, shared)).status,
    401,
  );
});

test('solicitudes inválidas conservan errores HTTP seguros y no se presentan como fallos inciertos', async () => {
  for (const [headers, body, status, code] of [
    [{ 'Content-Type': 'application/json; charset=iso-8859-1' }, '{}', 415, 'BODY_ENCODING'],
    [
      { 'Content-Type': 'application/json', 'Content-Encoding': 'unsupported' },
      '{}',
      415,
      'BODY_ENCODING',
    ],
    [{ 'Content-Type': 'application/json' }, '{"private-marker":', 400, 'INVALID_JSON'],
    [
      { 'Content-Type': 'application/json' },
      JSON.stringify({ text: 'x'.repeat(129 * 1024) }),
      413,
      'BODY_SIZE',
    ],
  ] as const) {
    const response = await fetch(`${url}/api/state`, { method: 'POST', headers, body });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const payload = await response.json();
    assert.equal(payload.error.code, code);
    assert.deepEqual(Object.keys(payload.error).sort(), ['code', 'message']);
    assert.ok(!JSON.stringify(payload).includes('private-marker'));
  }
});

test('sesión real, origen, CSRF, permisos y revocación', async () => {
  const admin = await login();
  const mozo = await login('mozo');
  assert.equal((await api('state')).status, 401);
  assert.equal((await api('state', {}, admin)).status, 200);
  const wrong = { ...admin, csrf: 'incorrecta' };
  assert.equal(
    (await api('commands/cash.open', { opening_cents: 0 }, wrong, randomUUID())).status,
    403,
  );
  await command(mozo, 'cash.open', { opening_cents: 0 }, 403);
  await command(admin, 'toString', {}, 404);
  const badOrigin = await fetch(`${url}/api/state`, {
    method: 'POST',
    headers: {
      Origin: 'https://otra.example',
      'Content-Type': 'application/json',
      Cookie: admin.cookie,
    },
    body: '{}',
  });
  assert.equal(badOrigin.status, 403);
  assert.equal((await fetch(`${url}/api/state`)).status, 404);
  assert.equal((await api('auth/logout', {}, admin)).status, 200);
  assert.equal((await api('state', {}, admin)).status, 401);
});
test('recuperación local: token vence, un solo uso y revoca sesiones', async () => {
  const admin = await login();
  const mozo = await login('mozo');
  const unknown = await api('auth/recover', { username: 'inexistente' });
  const known = await api('auth/recover', { username: 'mozo' });
  assert.deepEqual(known.body, unknown.body);
  assert.equal((await api('demo/mailbox', {}, mozo)).status, 403);
  const mailbox = await api<{ messages: { token: string }[] }>('demo/mailbox', {}, admin);
  const token = mailbox.body.messages[0]!.token;
  const password = 'NuevaClaveDePrueba2026!';
  assert.equal((await api('auth/reset', { token, password })).status, 200);
  assert.equal((await api('auth/reset', { token, password })).status, 422);
  assert.equal((await api('state', {}, mozo)).status, 401);
  await login('mozo', password);
  await api('auth/recover', { username: 'mozo' });
  const next = (await api<{ messages: { token: string }[] }>('demo/mailbox', {}, admin)).body
    .messages[0]!.token;
  await pool.query(
    "UPDATE password_resets SET expires_at=now()-interval '1 minute' WHERE used_at IS NULL",
  );
  assert.equal((await api('auth/reset', { token: next, password })).status, 422);
});
test('limitación de intentos persiste ante credenciales erróneas', async () => {
  await pool.query(`INSERT INTO auth_attempts(bucket,attempts) VALUES($1,20)`, [
    (await import('../src/modules/security.js')).sha256('127.0.0.1:login'),
  ]);
  assert.equal(
    (await api('auth/login', { username: 'admin', password: 'incorrecta' })).status,
    429,
  );
});

test('solicitudes comunes tienen límite pequeño e imágenes exigen permisos antes de leer el cuerpo', async () => {
  const admin = await login();
  const mozo = await login('mozo');
  const oversized = { padding: 'x'.repeat(140_000) };
  const ordinary = await api('commands/cash.open', oversized, admin, randomUUID());
  assert.equal(ordinary.status, 413);
  assert.equal((ordinary.body.error as Row).code, 'BODY_SIZE');
  assert.equal((await api('products/image', oversized)).status, 401);
  assert.equal((await api('products/image', oversized, mozo)).status, 403);
  // An authorized image reaches image validation, rather than the ordinary body limit.
  assert.equal((await api('products/image', oversized, admin)).status, 422);
});

test('carta pública e imágenes limitan ráfagas y conservan errores JSON con tiempo de reintento', async () => {
  const isolated = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => isolated.once('listening', resolve));
  const base = `http://127.0.0.1:${(isolated.address() as AddressInfo).port}`;
  const admin = await login();
  try {
    for (let index = 0; index < 120; index++) {
      const response = await fetch(`${base}/api/public/missing`, { method: 'POST' });
      assert.equal(response.status, 404);
      await response.arrayBuffer();
    }
    const publicBlocked = await fetch(`${base}/api/public/menu`, {
      method: 'POST',
      headers: { 'X-Forwarded-For': '203.0.113.99' },
    });
    assert.equal(publicBlocked.status, 429);
    assert.ok(Number(publicBlocked.headers.get('Retry-After')) > 0);
    assert.equal(publicBlocked.headers.get('Cache-Control'), 'no-store');
    assert.equal((await publicBlocked.json()).error.code, 'RATE_LIMIT');
    for (let index = 0; index < 12; index++) {
      const response = await fetch(`${base}/api/products/image`, {
        method: 'POST',
        headers: {
          Cookie: admin.cookie,
          'X-CSRF-Token': admin.csrf,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      assert.equal(response.status, 422);
      await response.arrayBuffer();
    }
    const uploadBlocked = await fetch(`${base}/api/products/image`, {
      method: 'POST',
      headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf },
    });
    assert.equal(uploadBlocked.status, 429);
    assert.ok(Number(uploadBlocked.headers.get('Retry-After')) > 0);
    assert.equal((await uploadBlocked.json()).error.code, 'RATE_LIMIT');
  } finally {
    await new Promise<void>((resolve) => isolated.close(() => resolve()));
  }
});
test('categorías y subcategorías: jerarquía válida, disponibilidad heredada y borradores protegidos', async () => {
  const admin = await login();
  const parent = (
    await command(admin, 'category.save', { name: 'Especialidades', active: true, sort_order: 15 })
  ).result;
  const child = (
    await command(admin, 'category.save', {
      name: 'Cafés de origen',
      active: true,
      parent_id: parent.id,
      sort_order: 20,
    })
  ).result;
  const product = (await state(admin)).products.find((p) => p.id === coffee)!;
  await command(admin, 'product.save', { ...product, category_id: child.id });
  const account = await open(admin);
  const added = await add(admin, account.id, coffee);
  for (const body of [
    { id: parent.id, name: parent.name, parent_id: child.id, active: true },
    { id: child.id, name: child.name, parent_id: child.id, active: true },
    { name: 'Tercer nivel', parent_id: child.id, active: true },
    { name: 'Superior inexistente', parent_id: randomUUID(), active: true },
  ])
    await command(admin, 'category.save', body, 422);
  await assert.rejects(
    pool.query('INSERT INTO categories(name,parent_id) VALUES($1,$2)', [
      'Nivel inválido',
      child.id,
    ]),
    { code: '23514' },
  );
  // Existing clients can edit a child without changing its parent.
  const renamed = (
    await command(admin, 'category.save', {
      id: child.id,
      name: 'Cafés seleccionados',
      active: true,
    })
  ).result;
  assert.equal(renamed.parent_id, parent.id);
  assert.equal(renamed.sort_order, 20);
  await command(admin, 'category.save', { ...parent, active: false });
  const publicMenu = (await api<{ categories: Row[]; products: Row[] }>('public/menu')).body;
  assert.ok(!publicMenu.categories.some((c) => c.id === child.id));
  assert.ok(!publicMenu.products.some((p) => p.id === coffee));
  await command(
    admin,
    'item.add',
    {
      account_id: account.id,
      version: added.account.version,
      product_id: coffee,
      quantity: 1,
      notes: '',
      addon_ids: [],
    },
    422,
  );
  await command(
    admin,
    'item.edit',
    {
      account_id: account.id,
      version: added.account.version,
      item_id: added.item.id,
      quantity: 2,
      notes: '',
    },
    422,
  );
  await command(
    admin,
    'order.send',
    { account_id: account.id, version: added.account.version, item_ids: [added.item.id] },
    422,
  );
  await command(admin, 'category.save', { ...child, active: true }, 422);
  assert.equal((await current(admin, account.id)).subtotal_cents, added.account.subtotal_cents);
  await command(admin, 'category.save', { ...parent, active: true });
  const printed = (await api<{ content_base64: string }>('public/menu/print')).body;
  const html = Buffer.from(printed.content_base64, 'base64').toString('utf8');
  assert.ok(html.includes('<h2>Especialidades</h2>'));
  assert.ok(html.includes('<h3>Cafés seleccionados</h3>'));
  assert.ok(html.includes('Café · Con leche'));
  await command(admin, 'order.send', {
    account_id: account.id,
    version: added.account.version,
    item_ids: [added.item.id],
  });
});

test('migración de la carta existente conserva productos, variantes, precios e historial', async () => {
  const admin = await login();
  const account = await open(admin);
  await add(admin, account.id, coffee);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(
      'DROP TRIGGER category_depth ON categories; DROP FUNCTION check_category_depth(); ALTER TABLE categories DROP COLUMN parent_id; ALTER TABLE categories DROP COLUMN sort_order',
    );
    await db.query(
      "DELETE FROM categories WHERE id IN ('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000005')",
    );
    await db.query(
      "UPDATE categories SET name=CASE name WHEN 'Cafés clásicos' THEN 'Cafetería' WHEN 'Aguas y gaseosas' THEN 'Bebidas' ELSE name END",
    );
    const catalog = JSON.parse(
      await readFile(new URL('../catalog/baguette-menu.json', import.meta.url), 'utf8'),
    );
    const { defaultVariation } = await import('../src/modules/catalog-variations.js');
    for (const section of catalog.categories) {
      const c = (
        await db.query(
          'INSERT INTO categories(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET active=true RETURNING id',
          [section.name],
        )
      ).rows[0];
      for (const [name, price, description] of section.items) {
        const v = defaultVariation(section.name, name);
        await db.query(
          'INSERT INTO products(category_id,name,price_cents,description,destination,variant_group,variant_name) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [
            c.id,
            name,
            price * 100,
            description,
            section.destination,
            v.variant_group,
            v.variant_name,
          ],
        );
      }
    }
    const beforeProducts = (await db.query('SELECT * FROM products ORDER BY id')).rows;
    const beforeItems = (await db.query('SELECT * FROM items ORDER BY id')).rows;
    await db.query(
      await readFile(new URL('../sql/011_category_hierarchy.sql', import.meta.url), 'utf8'),
    );
    assert.deepEqual((await db.query('SELECT * FROM products ORDER BY id')).rows, beforeProducts);
    assert.deepEqual((await db.query('SELECT * FROM items ORDER BY id')).rows, beforeItems);
    const tree = (await db.query('SELECT * FROM categories')).rows;
    assert.equal(tree.filter((c) => !c.parent_id).length, 5);
    assert.equal(tree.filter((c) => c.parent_id).length, 27);
    assert.deepEqual(
      tree
        .filter((c) => !c.parent_id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => c.name),
      ['Cafetería', 'Desayunos', 'Cocina', 'Dulces', 'Bebidas'],
    );
    assert.equal(
      tree.find((c) => c.name === 'Cafés clásicos').id,
      '10000000-0000-4000-8000-000000000001',
    );
  } finally {
    await db.query('ROLLBACK');
    db.release();
  }
});

test('catálogo compartido, filtro público, instantáneas y archivo de carta persistido', async () => {
  const admin = await login();
  const account = await open(admin);
  const added = await add(admin, account.id, coffee, 2, ['20000000-0000-4000-8000-000000000001']);
  const old = added.account.subtotal_cents;
  const product = (await state(admin)).products.find((p) => p.id === coffee)!;
  await command(admin, 'product.save', {
    ...product,
    name: 'Café actualizado',
    price_cents: 999999,
  });
  assert.equal((await current(admin, account.id)).subtotal_cents, old);
  const data = (await api<{ products: Row[] }>('public/menu')).body;
  assert.equal(data.products.find((p) => p.id === coffee)!.name, 'Café actualizado');
  assert.ok(!data.products.some((p) => p.id === '30000000-0000-4000-8000-000000000006'));
  assert.ok(!('destination' in data.products[0]!));
  assert.ok(!('active' in data.products[0]!));
  const generated = await api<{ id: string; content_base64: string }>('public/menu/print');
  assert.equal(generated.status, 200);
  const stored = (
    await pool.query('SELECT path FROM stored_files WHERE id=$1', [generated.body.id])
  ).rows[0] as { path: string };
  assert.equal(
    (
      await pool.query('SELECT content FROM binary_assets WHERE path=$1', [stored.path])
    ).rows[0].content.toString('base64'),
    generated.body.content_base64,
  );
  assert.equal((await api('files/download', { id: generated.body.id })).status, 200);
});
test('mesa: capacidad, cambio responsable, mover plano/cuenta y baja lógica', async () => {
  const admin = await login();
  const created = await open(admin);
  await command(
    admin,
    'account.update',
    { account_id: created.id, version: created.version, guests: 3 },
    422,
  );
  await command(admin, 'account.update', {
    account_id: created.id,
    version: created.version,
    waiter_id: '50000000-0000-4000-8000-000000000006',
  });
  const before = await current(admin, created.id);
  await command(admin, 'table.save', {
    id: table,
    label: '1',
    capacity: 2,
    sector: 'Salón',
    x: 3,
    y: 4,
    active: true,
  });
  assert.equal((await current(admin, created.id)).table_id, table);
  await command(admin, 'account.move', {
    account_id: created.id,
    version: before.version,
    table_id: table2,
  });
  assert.equal((await current(admin, created.id)).table_id, table2);
  await command(
    admin,
    'table.save',
    { id: table2, label: '2', capacity: 4, sector: 'Salón', x: 2, y: 0, active: false },
    409,
  );
  await command(admin, 'table.save', {
    id: table,
    label: '1',
    capacity: 2,
    sector: 'Salón',
    x: 3,
    y: 4,
    active: false,
  });
  assert.equal((await state(admin)).tables.find((t) => t.id === table)!.active, false);
});
test('unión física separada de cuentas, división por cantidades, transferencia y agrupación', async () => {
  const admin = await login();
  const source = await open(admin);
  const value = await add(admin, source.id, pastry, 3);
  const group = await command(admin, 'table.group', {
    table_ids: [table, table2],
    group_id: randomUUID(),
  });
  assert.ok(group.result.group_id);
  assert.equal((await current(admin, source.id)).table_id, table);
  const split = await command<{ source: Account; target: Account }>(admin, 'account.split', {
    account_id: source.id,
    version: value.account.version,
    selections: [{ item_id: value.item.id, quantity: 1 }],
  });
  assert.equal(
    split.result.source.total_cents + split.result.target.total_cents,
    value.account.total_cents,
  );
  const targetItem = (await state(admin)).items.find(
    (i) => i.account_id === split.result.target.id,
  )!;
  await command(admin, 'item.transfer', {
    account_id: split.result.target.id,
    version: split.result.target.version,
    target_account_id: source.id,
    target_version: split.result.source.version,
    selections: [{ item_id: targetItem.id, quantity: 1 }],
  });
  const latest = await current(admin, source.id);
  const sister = await current(admin, split.result.target.id);
  await command(admin, 'account.merge', {
    account_id: source.id,
    version: latest.version,
    source_account_id: sister.id,
    source_version: sister.version,
  });
  await command(admin, 'table.group', { table_ids: [table, table2], group_id: null });
  assert.equal((await current(admin, source.id)).total_cents, value.account.total_cents);
});
test('enviar conserva disponibilidad y corrección incremental; preparación y entrega están deshabilitadas', async () => {
  const admin = await login();
  const kitchen = await login('cocina');
  const bar = await login('bar');
  const account = await open(admin);
  const added = await add(admin, account.id, coffee, 1);
  await pool.query('UPDATE products SET available=false WHERE id=$1', [coffee]);
  await command(
    admin,
    'order.send',
    { account_id: account.id, version: added.account.version, item_ids: [added.item.id] },
    422,
  );
  await pool.query('UPDATE products SET available=true WHERE id=$1', [coffee]);
  await command(admin, 'order.send', {
    account_id: account.id,
    version: added.account.version,
    item_ids: [added.item.id],
  });
  for (const session of [kitchen, bar, admin])
    await command(
      session,
      'item.status',
      {
        account_id: account.id,
        version: (await current(admin, account.id)).version,
        item_id: added.item.id,
        status: 'preparing',
      },
      409,
    );
  assert.equal(
    (await state(admin)).items.find((item) => item.id === added.item.id)!.status,
    'sent',
  );
  await command(admin, 'item.edit', {
    account_id: account.id,
    version: (await current(admin, account.id)).version,
    item_id: added.item.id,
    quantity: 2,
    notes: 'Corrección',
  });
  const jobs = (await state(admin)).printJobs;
  assert.equal(jobs.length, 2);
  assert.ok(jobs.some((p) => String(p.content).includes('CORRECCIÓN')));
  const restricted = await state(kitchen);
  assert.equal(restricted.items.length, 0);
  assert.equal(restricted.accounts.length, 0);
  assert.equal(restricted.payments.length, 0);
});
test('idempotencia persistente, conflicto de contenido, concurrencia y rollback', async () => {
  const admin = await login();
  const account = await open(admin);
  const body = {
    account_id: account.id,
    version: account.version,
    product_id: pastry,
    quantity: 1,
    notes: '',
    addon_ids: [],
  };
  const key = randomUUID();
  const first = await command(admin, 'item.add', body, 200, key);
  const second = await command(admin, 'item.add', body, 200, key);
  assert.equal(first.operation_id, second.operation_id);
  assert.equal(second.replayed, true);
  const legacyKey = randomUUID();
  const security = await import('../src/modules/security.js');
  const existing = (
    await pool.query('SELECT user_id,result FROM operations WHERE id=$1', [first.operation_id])
  ).rows[0] as { user_id: string; result: unknown };
  await pool.query(
    'INSERT INTO operations(user_id,operation_key,action,content_hash,result) VALUES($1,$2,$3,$4,$5)',
    [
      existing.user_id,
      legacyKey,
      'item.add',
      security.sha256(security.canonical({ action: 'item.add', data: body })),
      existing.result,
    ],
  );
  assert.equal((await command(admin, 'item.add', body, 200, legacyKey)).replayed, true);
  const hashes = (
    await pool.query('SELECT content_hash FROM operations WHERE id=$1', [first.operation_id])
  ).rows[0] as { content_hash: string };
  assert.ok(hashes.content_hash.startsWith('hmac:v1:'));
  await command(admin, 'item.add', { ...body, quantity: 2 }, 409, key);
  const found = await api<{ found: boolean; operation_id: string }>(
    'operations/lookup',
    { key },
    admin,
  );
  assert.equal(found.body.operation_id, first.operation_id);
  const mozo = await login('mozo');
  assert.equal(
    (await api<{ found: boolean }>('operations/lookup', { key }, mozo)).body.found,
    false,
  );
  const currentAccount = await current(admin, account.id);
  const concurrentBody = { ...body, version: currentAccount.version };
  const parallel = await Promise.all([
    api('commands/item.add', concurrentBody, admin, randomUUID()),
    api('commands/item.add', concurrentBody, admin, randomUUID()),
  ]);
  assert.deepEqual(parallel.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await state(admin)).items.length, 2);
  const sameKey = randomUUID();
  const retryBody = { ...body, version: (await current(admin, account.id)).version };
  const retries = await Promise.all([
    api<CommandResult>('commands/item.add', retryBody, admin, sameKey),
    api<CommandResult>('commands/item.add', retryBody, admin, sameKey),
  ]);
  assert.deepEqual(
    retries.map((r) => r.status),
    [200, 200],
  );
  assert.equal(retries[0]!.body.operation_id, retries[1]!.body.operation_id);
  assert.equal((await state(admin)).items.length, 3);
  const before = (await pool.query('SELECT count(*) FROM operations')).rows[0].count as string;
  await command(
    admin,
    'account.split',
    {
      account_id: account.id,
      version: (await current(admin, account.id)).version,
      selections: [{ item_id: randomUUID(), quantity: 1 }],
    },
    404,
  );
  assert.equal((await state(admin)).accounts.length, 1);
  assert.equal((await pool.query('SELECT count(*) FROM operations')).rows[0].count, before);
});
test('solo caja o encargado descuentan, redondea y conserva auditoría', async () => {
  const admin = await login();
  const mozo = await login('mozo');
  const account = await open(admin);
  await add(admin, account.id);
  const body = {
    account_id: account.id,
    version: (await current(admin, account.id)).version,
    kind: 'percent',
    value: 15,
    reason: 'Atención de cortesía',
  };
  await command(mozo, 'discount.apply', body, 403);
  await command(
    mozo,
    'discount.apply',
    { ...body, authorization: { username: 'caja', password: config.DEMO_PASSWORD } },
    403,
  );
  const caja = await login('caja');
  const valid = await command<{ discount: Row; account: Account }>(caja, 'discount.apply', body);
  assert.equal(valid.result.account.discount_cents, 27000);
  assert.equal(valid.result.discount.authorized_by, '50000000-0000-4000-8000-000000000002');
  const text = JSON.stringify((await pool.query('SELECT * FROM audit_events')).rows);
  assert.ok(!text.includes(config.DEMO_PASSWORD!));
  assert.ok(!text.includes('password'));
  await command(
    admin,
    'discount.apply',
    { ...body, version: valid.result.account.version, value: 101 },
    409,
  );
});
test('cobros parciales mixtos, doble cobro concurrente, vuelto y cierre sin saldo', async () => {
  const admin = await login();
  await command(admin, 'cash.open', { opening_cents: 100000 });
  const account = await open(admin);
  await add(admin, account.id, pastry, 3);
  await sendOrder(admin, account.id);
  await pay(admin, account.id, 100000, 'debit');
  const before = await current(admin, account.id);
  await command(
    admin,
    'item.edit',
    {
      account_id: account.id,
      version: before.version,
      item_id: (await state(admin)).items[0]!.id,
      quantity: 1,
      notes: '',
    },
    409,
  );
  const body = {
    account_id: account.id,
    version: before.version,
    amount_cents: before.balance_cents,
    method: 'cash',
    received_cents: before.balance_cents + 1000,
  };
  const responses = await Promise.all([
    api<CommandResult<{ payment: Row }>>('commands/payment.add', body, admin, randomUUID()),
    api('commands/payment.add', body, admin, randomUUID()),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const paid = await current(admin, account.id);
  assert.equal(paid.balance_cents, 0);
  assert.ok(Number.isSafeInteger(paid.paid_cents));
  assert.equal((await state(admin)).payments.length, 2);
  const cashPayment = (await state(admin)).payments.find((p) => p.method === 'cash')!;
  assert.equal(cashPayment.change_cents, 1000);
  await command(admin, 'account.close', { account_id: account.id, version: paid.version });
});
test('partes iguales e ítems asignan centavos exactos y bloquean parte repetida', async () => {
  const admin = await login();
  await command(admin, 'cash.open', { opening_cents: 0 });
  const product = (await state(admin)).products.find((p) => p.id === pastry)!;
  await command(admin, 'product.save', { ...product, price_cents: 101 });
  const account = await open(admin);
  await add(admin, account.id);
  await sendOrder(admin, account.id);
  const quote = await api<{ parts: number[] }>(
    'accounts/quote',
    { account_id: account.id, parts: 3 },
    admin,
  );
  assert.deepEqual(quote.body.parts, [34, 34, 33]);
  for (let part = 1; part <= 3; part++) {
    await command(admin, 'payment.add', {
      account_id: account.id,
      version: (await current(admin, account.id)).version,
      amount_cents: quote.body.parts[part - 1],
      method: 'debit',
      split: { kind: 'equal', parts: 3, part },
    });
  }
  assert.equal((await current(admin, account.id)).balance_cents, 0);
  await command(
    admin,
    'payment.add',
    {
      account_id: account.id,
      version: (await current(admin, account.id)).version,
      amount_cents: 34,
      method: 'debit',
      split: { kind: 'equal', parts: 3, part: 1 },
    },
    422,
  );
  const other = await open(admin, table2);
  const added = await add(admin, other.id, pastry, 3);
  await sendOrder(admin, other.id);
  const selection = [{ item_id: added.item.id, quantity: 1 }];
  const itemQuote = await api<{ amount_cents: number }>(
    'accounts/quote',
    { account_id: other.id, selections: selection },
    admin,
  );
  assert.equal(itemQuote.body.amount_cents, 101);
  await command(admin, 'payment.add', {
    account_id: other.id,
    version: (await current(admin, other.id)).version,
    amount_cents: 101,
    method: 'credit',
    split: { kind: 'items', selections: selection },
  });
  assert.equal((await pool.query('SELECT count(*) FROM payment_allocations')).rows[0].count, 1);
});
test('devolución: descuento de cuenta se asigna a cada producto, reintegro compensatorio inmutable', async () => {
  const admin = await login();
  await command(admin, 'cash.open', { opening_cents: 1000000 });
  const account = await open(admin);
  const first = await add(admin, account.id);
  await add(admin, account.id);
  await sendOrder(admin, account.id);
  await command(admin, 'discount.apply', {
    account_id: account.id,
    version: (await current(admin, account.id)).version,
    kind: 'percent',
    value: 50,
    reason: 'Prueba descuento',
  });
  const paid = await pay(admin, account.id);
  const body = {
    account_id: account.id,
    version: paid.result.account.version,
    payment_id: paid.result.payment.id,
    item_id: first.item.id,
    quantity: 1,
    amount_cents: 180000,
    reason: 'Devolución de producto',
    return_product: true,
  };
  await command(admin, 'refund.add', body, 422);
  const valid = await command<{ refund: Row; account: Account }>(admin, 'refund.add', {
    ...body,
    amount_cents: 90000,
  });
  assert.equal(valid.result.account.balance_cents, 0);
  assert.equal(valid.result.account.paid_cents, 90000);
  assert.equal(valid.result.account.total_cents, 90000);
  assert.equal((await state(admin)).payments[0]!.amount_cents, 180000);
  await command(
    admin,
    'refund.add',
    { ...body, version: valid.result.account.version, amount_cents: 90000 },
    422,
  );
  await assert.rejects(pool.query('UPDATE payments SET amount_cents=1'));
  await assert.rejects(pool.query('DELETE FROM audit_events'));
});
test('caja: ingreso/egreso, bloqueos, arqueo y diferencia', async () => {
  const admin = await login();
  await command(admin, 'cash.open', { opening_cents: 10000 });
  await command(admin, 'cash.move', { amount_cents: 1000, kind: 'in', concept: 'Fondo de prueba' });
  await command(admin, 'cash.move', {
    amount_cents: 500,
    kind: 'out',
    concept: 'Retiro de prueba',
  });
  const account = await open(admin);
  await command(admin, 'cash.close', { counted_cents: 10500 }, 409);
  await command(admin, 'account.close', { account_id: account.id, version: account.version });
  const closed = await command(admin, 'cash.close', { counted_cents: 10000 });
  assert.equal(closed.result.expected_cents, 10500);
  assert.equal(closed.result.difference_cents, -500);
});
test('impresión y fiscal: fallo, reintento seguro, incierto y consulta sin duplicar cobro', async () => {
  const admin = await login();
  await command(admin, 'cash.open', { opening_cents: 0 });
  const account = await open(admin);
  await add(admin, account.id, coffee);
  await sendOrder(admin, account.id);
  await pay(admin, account.id, undefined, 'debit');
  const job = (await state(admin)).printJobs[0]!;
  await command(admin, 'print.process', { id: job.id, mode: 'offline' });
  await command(admin, 'print.retry', { id: job.id });
  await command(admin, 'print.process', { id: job.id, mode: 'uncertain' });
  await command(admin, 'print.retry', { id: job.id }, 409);
  await command(admin, 'print.process', { id: job.id, mode: 'success' });
  assert.equal((await state(admin)).printJobs[0]!.attempts, 2);
  const copy = await command(admin, 'print.copy', {
    id: job.id,
    reason: 'Copia solicitada por encargado',
  });
  assert.ok(String(copy.result.content).startsWith('COPIA'));
  const prepared = await command(admin, 'invoice.prepare', {
    account_id: account.id,
    version: (await current(admin, account.id)).version,
    recipient_name: 'Consumidor Final',
    recipient_document: '',
    kind: 'Factura de demostración',
  });
  await command(admin, 'invoice.process', { id: prepared.result.id, mode: 'reject' });
  assert.equal((await state(admin)).payments.length, 1);
  await command(admin, 'invoice.retry', { id: prepared.result.id });
  await command(admin, 'invoice.process', { id: prepared.result.id, mode: 'uncertain' });
  await command(admin, 'invoice.retry', { id: prepared.result.id }, 409);
  const resolved = await command<{ invoice: Row; file: Row }>(admin, 'invoice.resolve', {
    id: prepared.result.id,
  });
  assert.equal(resolved.result.invoice.status, 'issued');
  assert.equal(resolved.result.invoice.disclaimer, 'Demostración. Sin validez fiscal');
  assert.equal((resolved.result.invoice.details as { concepts: Row[] }).concepts.length, 1);
  assert.equal((await state(admin)).payments.length, 1);
});
test('auditoría/export protegidos y resultado previo vuelve a comprobar permisos', async () => {
  const admin = await login();
  const user = await command(admin, 'user.save', {
    username: 'revisor',
    name: 'Revisor Prueba',
    role: 'admin',
    active: true,
    password: config.DEMO_PASSWORD,
  });
  const revisor = await login('revisor');
  const generated = await command(revisor, 'report.export', { kind: 'audit' });
  await command(admin, 'user.save', {
    id: user.result.id,
    username: 'revisor',
    name: 'Revisor Prueba',
    role: 'waiter',
    active: true,
  });
  assert.equal((await api('state', {}, revisor)).status, 401);
  const changed = await login('revisor');
  assert.equal((await api('operations/lookup', { key: generated.key }, changed)).status, 403);
  assert.equal((await api('files/download', { id: generated.result.id }, changed)).status, 403);
  assert.equal((await api('audit/query', {}, changed)).status, 403);
});
test('persistencia: nueva instancia HTTP conserva borrador, sesión y operación en PostgreSQL', async () => {
  const admin = await login();
  const account = await open(admin);
  const value = await add(admin, account.id);
  const secondServer = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => secondServer.once('listening', resolve));
  try {
    const secondUrl = `http://127.0.0.1:${(secondServer.address() as AddressInfo).port}`;
    const response = await fetch(`${secondUrl}/api/state`, {
      method: 'POST',
      headers: {
        Cookie: admin.cookie,
        Origin: config.origins[0]!,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    const data = (await response.json()) as State;
    assert.equal(data.items.find((i) => i.id === value.item.id)!.status, 'draft');
    assert.equal(
      data.accounts.find((a) => a.id === account.id)!.subtotal_cents,
      value.account.subtotal_cents,
    );
  } finally {
    await new Promise<void>((resolve) => secondServer.close(() => resolve()));
  }
  const connections = await transaction((db) =>
    db.query(
      'SELECT count(*)::integer count FROM pg_stat_activity WHERE datname=current_database()',
    ),
  );
  assert.ok((connections.rows[0] as { count: number }).count <= 10);
});
test('importes agregados superan int4 sin overflow en descuentos, división e instantánea fiscal', async () => {
  const admin = await login();
  const product = (await state(admin)).products.find((p) => p.id === pastry)!;
  await command(admin, 'product.save', { ...product, price_cents: 100000000 });
  const account = await open(admin);
  await add(admin, account.id, pastry, 100);
  const discount = await command<{ discount: Row; account: Account }>(admin, 'discount.apply', {
    account_id: account.id,
    version: (await current(admin, account.id)).version,
    kind: 'percent',
    value: 50,
    reason: 'Prueba de límites exactos',
  });
  assert.equal(discount.result.discount.base_cents, 10000000000);
  assert.equal(discount.result.discount.amount_cents, 5000000000);
  assert.equal(discount.result.account.balance_cents, 5000000000);
  await sendOrder(admin, account.id);
  await command(admin, 'cash.open', { opening_cents: 0 });
  // Payment request limits remain 100000000; the shared base can exceed int4.
  const plan = await transaction(async (db) =>
    db.query(
      'INSERT INTO payment_plans(account_id,parts,base_cents) VALUES($1,30,5000000000) RETURNING base_cents',
      [account.id],
    ),
  );
  assert.equal(plan.rows[0].base_cents, 5000000000);
  for (let count = 0; count < 50; count++) await pay(admin, account.id, 100000000, 'debit');
  const prepared = await command(admin, 'invoice.prepare', {
    account_id: account.id,
    version: (await current(admin, account.id)).version,
    recipient_name: 'Consumidor Final',
    recipient_document: '',
    kind: 'B',
  });
  assert.equal(prepared.result.amount_cents, 5000000000);
  assert.ok(Number.isSafeInteger(prepared.result.amount_cents));
});
test('solo caja o encargado anulan y conservan corrección e historial', async () => {
  const admin = await login();
  const mozo = await login('mozo');
  const account = await open(admin);
  const value = await add(admin, account.id, coffee);
  await command(admin, 'order.send', {
    account_id: account.id,
    version: value.account.version,
    item_ids: [value.item.id],
  });
  const body = {
    account_id: account.id,
    version: (await current(admin, account.id)).version,
    item_id: value.item.id,
    reason: 'Cliente canceló el pedido',
  };
  await command(mozo, 'item.void', body, 403);
  await command(
    mozo,
    'item.void',
    { ...body, authorization: { username: 'caja', password: config.DEMO_PASSWORD } },
    403,
  );
  await command(await login('caja'), 'item.void', body);
  const result = await state(admin);
  assert.equal(result.items[0]!.status, 'void');
  assert.equal(result.accounts[0]!.subtotal_cents, 0);
  assert.equal(result.printJobs.length, 2);
  assert.ok(result.printJobs.some((job) => String(job.content).includes('ANULACIÓN')));
});
test('validación de imagen comprueba bytes reales y conserva solamente WebP reprocesada', async () => {
  const admin = await login();
  const mozo = await login('mozo');
  const invalid = {
    name: 'foto.png',
    content_base64: Buffer.from('<svg><script>1</script></svg>').toString('base64'),
  };
  assert.equal((await api('products/image', invalid, admin)).status, 422);
  assert.equal((await api('products/image', invalid, mozo)).status, 403);
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#2b5369' } })
    .png()
    .toBuffer();
  const uploaded = await api<{ image_url: string }>(
    'products/image',
    { name: 'foto.png', content_base64: png.toString('base64') },
    admin,
  );
  assert.equal(uploaded.status, 200);
  assert.match(uploaded.body.image_url, /^\/uploads\/[a-f0-9-]+\.webp$/);
  const delivered = await fetch(`${url}${uploaded.body.image_url}`);
  assert.equal(delivered.status, 200);
  assert.match(delivered.headers.get('Content-Type')!, /image\/webp/);
  assert.equal((await sharp(Buffer.from(await delivered.arrayBuffer())).metadata()).format, 'webp');
});
test('protección de autorización secundaria no se revierte al fallar la operación', async () => {
  const admin = await login();
  const caja = await login('caja');
  const account = await open(admin);
  await add(admin, account.id);
  const { sha256 } = await import('../src/modules/security.js');
  const bucket = sha256(`127.0.0.1:50000000-0000-4000-8000-000000000002:secondary-authorization`);
  await pool.query('INSERT INTO auth_attempts(bucket,attempts) VALUES($1,15)', [bucket]);
  await command(
    caja,
    'discount.apply',
    {
      account_id: account.id,
      version: (await current(admin, account.id)).version,
      kind: 'percent',
      value: 10,
      reason: 'Prueba de límite',
      authorization: { username: 'caja', password: config.DEMO_PASSWORD },
    },
    429,
  );
  assert.equal(
    (await pool.query('SELECT attempts FROM auth_attempts WHERE bucket=$1', [bucket])).rows[0]
      .attempts,
    16,
  );
  assert.equal((await state(admin)).discounts.length, 0);
});

test('PIN personal: obligatorio en libre y ocupada, vinculado a sesión y mesa, vence y permite recuperar un resultado confirmado', async () => {
  const admin = await login();
  const mozo = await login('mozo');
  const raw = async (
    session: Session,
    action: string,
    body: Row,
    grant = '',
    key = randomUUID(),
  ) => {
    const response = await fetch(`${url}/api/commands/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: session.cookie,
        'X-CSRF-Token': session.csrf,
        'Idempotency-Key': key,
        'X-Operation-Token': grant,
      },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: (await response.json()) as CommandResult & { error: { code: string } },
    };
  };
  const body = { table_id: table, waiter_id: waiter, guests: 1 };
  assert.equal((await raw(mozo, 'account.open', body)).body.error.code, 'PIN_REQUIRED');
  assert.equal(
    (await api('auth/operational-pin', { table_id: table, pin: '4202' }, mozo)).status,
    403,
  );
  assert.equal(
    (await api('auth/operational-pin', { table_id: table, pin: '303' }, mozo)).status,
    422,
  );
  const grant = await api<{ token: string }>(
    'auth/operational-pin',
    { table_id: table, pin: '4303' },
    mozo,
  );
  assert.equal(grant.status, 200);
  const other = await login('mozo');
  assert.equal((await raw(other, 'account.open', body, grant.body.token)).status, 403);
  assert.equal(
    (await raw(mozo, 'account.open', { ...body, table_id: table2 }, grant.body.token)).status,
    403,
  );
  const opened = await raw(mozo, 'account.open', body, grant.body.token);
  assert.equal(opened.status, 200);
  const account = opened.body.result as unknown as Account;
  const addBody = {
    account_id: account.id,
    version: account.version,
    product_id: pastry,
    quantity: 1,
    notes: '',
    addon_ids: [],
  };
  assert.equal((await raw(mozo, 'item.add', addBody)).body.error.code, 'PIN_REQUIRED');
  const key = randomUUID();
  assert.equal((await raw(mozo, 'item.add', addBody, grant.body.token, key)).status, 200);
  await pool.query("UPDATE operational_grants SET expires_at=now()-interval '1 second'");
  const replay = await raw(mozo, 'item.add', addBody, '', key);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  const sendBody = {
    account_id: account.id,
    version: (await current(admin, account.id)).version,
    item_ids: (await state(admin)).items.map((i) => i.id),
  };
  assert.equal(
    (await raw(mozo, 'order.send', sendBody, grant.body.token)).body.error.code,
    'PIN_REQUIRED',
  );
  const text = JSON.stringify((await pool.query('SELECT * FROM audit_events')).rows);
  assert.ok(!text.includes('4303'));
  assert.ok(!text.includes(grant.body.token));
  assert.equal((await state(admin)).items.length, 1);
});

test('PIN admite ceros iniciales, cambio revoca sesiones y no filtra secretos; intentos fallidos persisten', async () => {
  const admin = await login();
  const oldSession = await login('mozo');
  await command(admin, 'user.save', {
    id: waiter,
    username: 'mozo',
    name: 'Martín Camarero',
    role: 'waiter',
    active: true,
    pin: '0007',
  });
  assert.equal(
    (await api('auth/operational-pin', { table_id: table, pin: '4303' }, oldSession)).status,
    401,
  );
  const mozo = await login('mozo');
  assert.equal(
    (await api('auth/operational-pin', { table_id: table, pin: '0007' }, mozo)).status,
    200,
  );
  const publicState = JSON.stringify((await state(admin)).users);
  assert.ok(!publicState.includes('0007') && !publicState.includes('pin_hash'));
  const stored = (await pool.query('SELECT pin_hash FROM users WHERE id=$1', [waiter])).rows[0]
    .pin_hash;
  assert.match(stored, /^scrypt\$/);
  for (let i = 0; i < 8; i++) {
    assert.equal(
      (await api('auth/operational-pin', { table_id: table, pin: '4303' }, mozo)).status,
      403,
    );
  }
  assert.equal(
    (await api('auth/operational-pin', { table_id: table, pin: '0007' }, mozo)).status,
    429,
  );
  const text = JSON.stringify((await pool.query('SELECT * FROM audit_events')).rows);
  assert.ok(!text.includes('0007') && !text.includes(stored));
});

test('mozo ajusta cantidades del borrador; enviados, anulaciones, descuentos y cierre requieren permisos', async () => {
  const mozo = await login('mozo');
  const account = await open(mozo);
  const initial = await add(mozo, account.id, pastry, 2);
  const edit = {
    account_id: account.id,
    version: initial.account.version,
    item_id: initial.item.id,
    quantity: 1,
    notes: '',
  };
  await command(mozo, 'item.edit', edit);
  edit.version = (await current(mozo, account.id)).version;
  assert.equal((await state(mozo)).items.find((i) => i.id === initial.item.id)!.quantity, 1);
  await command(mozo, 'item.edit', { ...edit, quantity: 0 }, 422);
  await command(mozo, 'item.void', { ...edit, reason: 'Error de carga' }, 403);
  await command(
    mozo,
    'account.close',
    { account_id: account.id, version: initial.account.version },
    403,
  );
  await command(
    mozo,
    'discount.apply',
    { ...edit, kind: 'percent', value: 10, reason: 'Cortesía' },
    403,
  );
  await command(mozo, 'item.edit', { ...edit, quantity: 3 });
  await command(mozo, 'order.send', {
    account_id: account.id,
    version: (await current(mozo, account.id)).version,
    item_ids: [initial.item.id],
  });
  await command(
    mozo,
    'item.edit',
    { ...edit, version: (await current(mozo, account.id)).version, quantity: 3 },
    403,
  );
});

test('terminal compartida separa cookies y pide PIN que identifica al empleado sin selector', async () => {
  const admin = await login();
  const shared = await terminal();
  const read = await state(shared);
  assert.deepEqual(read.permissions, ['terminal_view']);
  assert.equal(read.mode, 'terminal');
  assert.equal(read.items.length, 0);
  assert.equal(read.payments.length, 0);
  assert.equal(read.cashSessions.length, 0);
  assert.ok(
    read.users.every(
      (user) => !('username' in user) && !('pin_lookup' in user) && !('pin_hash' in user),
    ),
  );
  const body = { table_id: table, guests: 1, waiter_id: '50000000-0000-4000-8000-000000000001' };
  await command(shared, 'account.open', body, 403);
  const extra = await api(
    'auth/operational-pin',
    { table_id: table, pin: '4303', user_id: waiter },
    shared,
  );
  assert.equal(extra.status, 422);
  const invalid = await api('auth/operational-pin', { table_id: table, pin: '9999' }, shared);
  assert.equal(invalid.status, 403);
  const identity = await identify(shared);
  assert.equal(identity.operator.id, waiter);
  assert.equal(identity.operator.name, 'Martín Camarero');
  assert.ok(identity.permissions.includes('operate'));
  assert.ok(!identity.permissions.includes('manage_catalog'));
  const account = await command<Account>(shared, 'account.open', body);
  assert.equal(account.result.waiter_id, waiter);
  assert.equal(
    (
      await pool.query('SELECT user_id,table_id FROM operations WHERE id=$1', [
        account.operation_id,
      ])
    ).rows[0].user_id,
    waiter,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT user_id FROM audit_events WHERE operation='account.open' ORDER BY created_at DESC LIMIT 1",
      )
    ).rows[0].user_id,
    waiter,
  );
  const both = { ...shared, cookie: `${admin.cookie}; ${shared.cookie}` };
  assert.equal((await api<{ user: Row }>('auth/session', {}, both)).body.user.role, 'terminal');
  assert.equal(
    (
      await api<{ user: Row }>(
        'auth/session',
        {},
        { ...both, mode: 'management', csrf: admin.csrf },
      )
    ).body.user.role,
    'admin',
  );
  await api('auth/logout', {}, { ...both, mode: 'management', csrf: admin.csrf });
  assert.equal((await api('auth/session', {}, shared)).status, 200);
});
test('terminal: admin PIN no habilita gestión; permisos sensibles se comprueban por empleado', async () => {
  const shared = await terminal();
  await identify(shared);
  const account = await open(shared);
  const added = await add(shared, account.id, coffee, 2);
  await command(shared, 'order.send', {
    account_id: account.id,
    version: added.account.version,
    item_ids: [added.item.id],
  });
  added.account.version = (await current(shared, account.id)).version;
  await command(
    shared,
    'item.edit',
    {
      account_id: account.id,
      version: (await current(shared, account.id)).version,
      item_id: added.item.id,
      quantity: 1,
      notes: '',
    },
    403,
  );
  await command(
    shared,
    'item.void',
    {
      account_id: account.id,
      version: added.account.version,
      item_id: added.item.id,
      reason: 'Prueba control',
    },
    403,
  );
  await command(
    shared,
    'payment.add',
    { account_id: account.id, version: added.account.version, amount_cents: 100, method: 'cash' },
    403,
  );
  await command(
    shared,
    'account.update',
    {
      account_id: account.id,
      version: added.account.version,
      waiter_id: '50000000-0000-4000-8000-000000000006',
    },
    403,
  );
  await identify(shared, '4101');
  for (const action of [
    'product.save',
    'user.save',
    'table.save',
    'report.export',
    'cash.open',
    'invoice.prepare',
  ])
    await command(shared, action, {}, 403);
  assert.equal((await api('audit/query', {}, shared)).status, 403);
  assert.equal((await api('demo/mailbox', {}, shared)).status, 403);
  assert.equal(
    (await api('products/image', { name: 'a.png', content_base64: 'AA==' }, shared)).status,
    403,
  );
  const projected = await state(shared);
  assert.ok(!projected.permissions.some((permission) => permission.startsWith('manage_')));
  assert.ok(!projected.permissions.includes('audit'));
});
test('terminal: release, cambio de operador, sesión, expiración y revocación impiden reutilizar grants', async () => {
  const shared = await terminal();
  await identify(shared);
  const account = await open(shared);
  const old = shared.operationToken!;
  await identify(shared, '4606');
  const newGrant = shared.operationToken!;
  const stale = { ...shared, operationToken: old };
  assert.equal((await api('state', {}, stale)).status, 403);
  const another = await terminal();
  another.operationToken = newGrant;
  assert.equal((await api('state', {}, another)).status, 403);
  // A delayed release from the old view cannot revoke the freshly identified employee.
  assert.equal((await api('auth/operator-release', {}, stale)).status, 200);
  assert.equal((await api('state', {}, shared)).status, 200);
  assert.equal((await api('auth/operator-release', {}, shared)).status, 200);
  assert.equal((await api('state', {}, shared)).status, 403);
  shared.operationToken = undefined;
  await identify(shared, '4303');
  await pool.query("UPDATE operational_grants SET expires_at=now()-interval '1 second'");
  await command(
    shared,
    'account.request',
    { account_id: account.id, version: account.version },
    403,
  );
  shared.operationToken = undefined;
  await identify(shared, '4303');
  await pool.query('UPDATE users SET active=false WHERE id=$1', [waiter]);
  await command(
    shared,
    'account.request',
    { account_id: account.id, version: account.version },
    403,
  );
});
test('terminal: duplicados PIN activos se rechazan, ceros iniciales y backfill conservan credenciales', async () => {
  const admin = await login();
  const duplicate = await command(
    admin,
    'user.save',
    {
      id: '50000000-0000-4000-8000-000000000006',
      username: 'moza',
      name: 'María Camarera',
      role: 'waiter',
      active: true,
      pin: '4303',
    },
    409,
  );
  assert.equal(duplicate.error.code, 'PIN_IN_USE');
  await command(admin, 'user.save', {
    id: waiter,
    username: 'mozo',
    name: 'Martín Camarero',
    role: 'waiter',
    active: true,
    pin: '0007',
  });
  const shared = await terminal();
  const person = await identify(shared, '0007');
  assert.equal(person.operator.id, waiter);
  const existing = (await pool.query('SELECT pin_hash,pin_lookup FROM users WHERE id=$1', [waiter]))
    .rows[0];
  await pool.query('UPDATE users SET pin_lookup=NULL WHERE id=$1', [waiter]);
  await seed(undefined, false);
  const preserved = (
    await pool.query('SELECT pin_hash,pin_lookup FROM users WHERE id=$1', [waiter])
  ).rows[0];
  assert.equal(preserved.pin_hash, existing.pin_hash);
  assert.equal(preserved.pin_lookup, null);
  assert.equal(
    (await api('auth/operational-pin', { table_id: table, pin: '0007' }, shared)).status,
    403,
  );
  // Only a verified known demo hash is eligible for a locator backfill.
  const other = '50000000-0000-4000-8000-000000000006';
  await pool.query('UPDATE users SET pin_lookup=NULL WHERE id=$1', [other]);
  await seed(undefined, false);
  const backfilled = (await pool.query('SELECT pin_lookup FROM users WHERE id=$1', [other]))
    .rows[0];
  assert.equal(typeof backfilled.pin_lookup, 'string');
  const auditText = JSON.stringify((await pool.query('SELECT * FROM audit_events')).rows);
  assert.ok(!auditText.includes('0007') && !auditText.includes(existing.pin_lookup));
});
test('terminal: operaciones pertenecen al PIN, replay exige grant y conserva la mesa original tras traslado', async () => {
  const shared = await terminal();
  await identify(shared);
  const account = await open(shared);
  const body = {
    account_id: account.id,
    version: account.version,
    product_id: pastry,
    quantity: 1,
    notes: '',
    addon_ids: [],
  };
  const first = await command(shared, 'item.add', body);
  const replay = await command(shared, 'item.add', body, 200, first.key);
  assert.equal(replay.operation_id, first.operation_id);
  const noPin = { ...shared, operationToken: undefined };
  assert.equal((await api('operations/lookup', { key: first.key }, noPin)).status, 403);
  await identify(shared, '4606');
  const conflict = await command(shared, 'item.add', body, 409, first.key);
  assert.equal(conflict.error.code, 'OPERATION_OWNER_MISMATCH');
  const lookup = await api<{ error: { code: string } }>(
    'operations/lookup',
    { key: first.key },
    shared,
  );
  assert.equal(lookup.status, 409);
  assert.equal(lookup.body.error.code, 'OPERATION_OWNER_MISMATCH');
  await identify(shared, '4303');
  const moveBody = {
    account_id: account.id,
    version: (await current(shared, account.id)).version,
    table_id: table2,
  };
  const moved = await command(shared, 'account.move', moveBody);
  assert.equal(
    (await command(shared, 'account.move', moveBody, 200, moved.key)).operation_id,
    moved.operation_id,
  );
  const recovered = await api<{ found: boolean; operation_id: string }>(
    'operations/lookup',
    { key: moved.key },
    shared,
  );
  assert.equal(recovered.body.operation_id, moved.operation_id);
  await command(shared, 'item.add', { ...body, version: 3 }, 403);
  shared.operationToken = undefined;
  await identify(shared, '4303', table2);
  assert.equal((await api('operations/lookup', { key: moved.key }, shared)).status, 403);
});
test('terminal: caja identificada cotiza y cobra sin estados de preparación y cierra solo tras enviar', async () => {
  const admin = await login();
  await command(admin, 'cash.open', { opening_cents: 0 });
  const shared = await terminal();
  await identify(shared);
  const account = await open(shared);
  const added = await add(shared, account.id);
  await identify(shared, '4202');
  await command(
    shared,
    'account.close',
    { account_id: account.id, version: added.account.version },
    409,
  );
  await command(shared, 'order.send', {
    account_id: account.id,
    version: added.account.version,
    item_ids: [added.item.id],
  });
  const quote = await api<{ amount_cents: number }>(
    'accounts/quote',
    { account_id: account.id },
    shared,
  );
  assert.equal(quote.status, 200);
  assert.equal(quote.body.amount_cents, 180000);
  assert.equal((await api('cash/summary', {}, shared)).status, 200);
  const paid = await pay(shared, account.id, undefined, 'debit');
  await command(shared, 'account.close', {
    account_id: account.id,
    version: paid.result.account.version,
  });
  const final = await current(admin, account.id);
  assert.equal(final.status, 'closed');
  assert.equal((await state(admin)).items[0]!.status, 'sent');
  assert.equal((await state(admin)).payments[0]!.user_id, '50000000-0000-4000-8000-000000000002');
});
test('pedido local: lote atómico, precios vigentes, replay sin duplicados y control de mesa', async () => {
  const shared = await terminal();
  await identify(shared);
  const payload = {
    table_id: table,
    guests: 2,
    items: [
      { product_id: pastry, quantity: 2, notes: 'Para compartir', addon_ids: [] },
      {
        product_id: coffee,
        quantity: 1,
        notes: 'Tibio',
        addon_ids: ['20000000-0000-4000-8000-000000000001'],
      },
    ],
  };
  const first = await command<{ account: Account; items: Item[] }>(shared, 'order.submit', payload);
  assert.equal(first.result.items.length, 2);
  assert.ok(first.result.items.every((item) => item.status === 'sent'));
  assert.equal(first.result.account.waiter_id, waiter);
  assert.equal(first.result.account.guests, 2);
  assert.equal(
    (await command(shared, 'order.submit', payload, 200, first.key)).operation_id,
    first.operation_id,
  );
  assert.equal((await state(shared)).items.length, 2);
  await command(
    shared,
    'order.submit',
    {
      ...payload,
      table_id: table2,
      account_id: first.result.account.id,
      version: first.result.account.version,
    },
    422,
  );
  await command(shared, 'order.submit', { ...payload, table_id: table2 }, 403);
  await command(
    shared,
    'order.submit',
    { ...payload, account_id: first.result.account.id, version: first.result.account.version - 1 },
    409,
  );
  assert.equal((await state(shared)).items.length, 2);
});

test('pedido local: un producto inválido revierte cuenta, ítems, auditoría y tickets del lote', async () => {
  const shared = await terminal();
  const identified = await api<{
    token: string;
    table_state: { accounts: Account[]; items: Item[] };
  }>('auth/operational-pin', { table_id: table, pin: '4303' }, shared);
  shared.operationToken = identified.body.token;
  assert.deepEqual(identified.body.table_state.accounts, []);
  assert.deepEqual(identified.body.table_state.items, []);
  await command(
    shared,
    'order.submit',
    {
      table_id: table,
      guests: 2,
      items: [
        { product_id: pastry, quantity: 1 },
        { product_id: randomUUID(), quantity: 1 },
      ],
    },
    422,
  );
  const after = await state(shared);
  assert.equal(after.accounts.length, 0);
  assert.equal(after.items.length, 0);
  assert.equal((await pool.query('SELECT count(*) FROM order_sends')).rows[0].count, 0);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM audit_events WHERE operation IN ('account.open','order.submit')",
      )
    ).rows[0].count,
    0,
  );
});

test('sesión prolongada: la comandera carga solo cuentas activas y gestión conserva el historial', async (t) => {
  await pool.query(
    `INSERT INTO accounts(table_id,waiter_id,guests,status,closed_at) SELECT $1,$2,1,'closed',now() FROM generate_series(1,200)`,
    [table, waiter],
  );
  await pool.query(
    `INSERT INTO items(account_id,product_id,name,description,unit_cents,quantity,notes,destination,status) SELECT a.id,$2,'Consumo histórico','',0,1,'','none','sent' FROM accounts a CROSS JOIN generate_series(1,5) WHERE a.table_id=$1 AND a.status='closed'`,
    [table, pastry],
  );
  const admin = await login();
  const active = await open(admin);
  await add(admin, active.id);
  const shared = await terminal();
  const map = await state(shared);
  const pin = await api<{ token: string; table_state: { accounts: Account[]; items: Item[] } }>(
    'auth/operational-pin',
    { table_id: table, pin: '4303' },
    shared,
  );
  assert.equal(pin.status, 200);
  shared.operationToken = pin.body.token;
  t.diagnostic(
    JSON.stringify({
      closedAccountsInDatabase: 200,
      historicalItemsInDatabase: 1000,
      mapAccounts: map.accounts.length,
      pinAccounts: pin.body.table_state.accounts.length,
      pinItems: pin.body.table_state.items.length,
      pinTableBytes: Buffer.byteLength(JSON.stringify(pin.body.table_state)),
    }),
  );
  assert.equal(map.accounts.length, 1);
  assert.equal(pin.body.table_state.accounts.length, 1);
  assert.equal(pin.body.table_state.items.length, 1);
  const operation = await state(shared);
  assert.equal(operation.accounts.length, 1);
  assert.equal(operation.items.length, 1);
  const history = await state(admin);
  assert.equal(history.accounts.length, 201);
  assert.equal(history.items.length, 1001);
});

test('gestión vuelve a comprobar revocación después de esperar el bloqueo transaccional', async () => {
  const admin = await login();
  const blocker = await pool.connect();
  let pending: ReturnType<typeof api> | undefined;
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT pg_advisory_xact_lock(725615870)');
    pending = api('commands/cash.open', { opening_cents: 0 }, admin, randomUUID());
    let waiting = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await pool.query(
        "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT pg_advisory_xact_lock%' LIMIT 1",
      );
      if (result.rowCount) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(waiting, 'La solicitud debe estar esperando el lock antes de revocar.');
    const { sha256 } = await import('../src/modules/security.js');
    await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1', [
      sha256(admin.cookie.split('=')[1]!),
    ]);
    await blocker.query('COMMIT');
    assert.equal((await pending).status, 401);
    assert.equal((await pool.query('SELECT count(*) FROM cash_sessions')).rows[0].count, 0);
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    if (pending) await pending;
  }
});
