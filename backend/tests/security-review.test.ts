import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import { setTimeout } from 'node:timers/promises';

assert.ok(process.env.TEST_DATABASE_URL, 'Configurá TEST_DATABASE_URL para PostgreSQL de pruebas.');
assert.ok(
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(process.env.TEST_DATABASE_URL).hostname),
  'Las pruebas de seguridad solo pueden restaurar PostgreSQL local.',
);
assert.equal(new URL(process.env.TEST_DATABASE_URL).pathname, '/baguette_test');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'true';
const { pool } = await import('../src/database/db.js');
const { migrate } = await import('../src/database/migrate.js');
const { seed } = await import('../src/database/seed.js');
const { createApp } = await import('../src/app.js');
const { config } = await import('../src/config/env.js');
const { hashPassword, sha256, verifyPassword } = await import('../src/modules/security.js');

interface Session {
  cookie: string;
  csrf: string;
  mode?: 'terminal';
}
const table = '40000000-0000-4000-8000-000000000001';
const waiter = '50000000-0000-4000-8000-000000000003';
let server: Server;
let url: string;

async function api(route: string, body: unknown = {}, session?: Session) {
  const response = await fetch(`${url}/api/${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: config.origins[0]!,
      ...(session
        ? {
            Cookie: session.cookie,
            'X-CSRF-Token': session.csrf,
            ...(session.mode ? { 'X-Session-Mode': session.mode } : {}),
          }
        : {}),
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as { csrf: string; error?: { code: string } },
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
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

test('hashes inválidos se rechazan sin derivaciones arbitrarias y siguen funcionando los formatos admitidos', async () => {
  const salt = 'a'.repeat(32);
  const legacyKey = scryptSync('Contraseña heredada', salt, 64).toString('hex');
  assert.equal(await verifyPassword('Contraseña heredada', `scrypt$${salt}$${legacyKey}`), true);
  assert.equal(await verifyPassword('contraseña errónea', `scrypt$${salt}$${legacyKey}`), false);
  const current = await hashPassword('Contraseña actual');
  assert.equal(await verifyPassword('Contraseña actual', current), true);
  for (const encoded of [
    '',
    `scrypt$0$8$1$${salt}$${legacyKey}`,
    `scrypt$1073741824$8$1$${salt}$${legacyKey}`,
    `scrypt$131072$8$1000000$${salt}$${legacyKey}`,
    `scrypt$131072$8$1$${salt}$${legacyKey}$extra`,
    `scrypt$131072$8$1$${salt}$${legacyKey}zz`,
    `scrypt$131072$8$1$sal inválida$${legacyKey}`,
    `scrypt$${salt}$abc`,
  ])
    assert.equal(await verifyPassword('Contraseña actual', encoded), false, encoded);
});

test('un PIN conocido no borra intentos fallidos de otros empleados y el bloqueo vence', async () => {
  const opened = await api('auth/terminal');
  assert.equal(opened.status, 200);
  assert.ok(opened.cookie);
  const session: Session = { cookie: opened.cookie, csrf: opened.body.csrf, mode: 'terminal' };
  const identify = (pin: string) => api('auth/operational-pin', { table_id: table, pin }, session);
  assert.equal((await identify('9999')).status, 403);
  assert.equal((await identify('4303')).status, 200);
  const bucket = sha256('127.0.0.1:terminal-pin');
  const attempts = async () =>
    (await pool.query('SELECT attempts FROM auth_attempts WHERE bucket=$1', [bucket])).rows[0]
      ?.attempts;
  assert.equal(await attempts(), 1);
  const concurrent = await Promise.all([identify('4303'), identify('4606')]);
  assert.deepEqual(
    concurrent.map((response) => response.status),
    [200, 200],
  );
  assert.equal(await attempts(), 1);
  for (let attempt = 0; attempt < 7; attempt++) assert.equal((await identify('9999')).status, 403);
  const blocked = await identify('4303');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error?.code, 'RATE_LIMIT');
  await pool.query(
    "UPDATE auth_attempts SET started_at=now()-interval '16 minutes' WHERE bucket=$1",
    [bucket],
  );
  assert.equal((await identify('4303')).status, 200);
  assert.equal(await attempts(), undefined);
});

test('la validación personal conserva fallos anteriores al ingresar el PIN correcto', async () => {
  const opened = await api('auth/login', { username: 'mozo', password: config.DEMO_PASSWORD });
  assert.equal(opened.status, 200);
  assert.ok(opened.cookie);
  const session: Session = { cookie: opened.cookie, csrf: opened.body.csrf };
  assert.equal(
    (await api('auth/operational-pin', { table_id: table, pin: '4202' }, session)).status,
    403,
  );
  assert.equal(
    (await api('auth/operational-pin', { table_id: table, pin: '4303' }, session)).status,
    200,
  );
  const attempt = await pool.query('SELECT attempts FROM auth_attempts WHERE bucket=$1', [
    sha256(`127.0.0.1:${waiter}:operational-pin`),
  ]);
  assert.equal(attempt.rows[0]?.attempts, 1);
});

for (const changed of ['password', 'active'] as const)
  test(`login en curso no crea una sesión después de cambiar ${changed}`, async () => {
    const newHash = await hashPassword('Nueva contraseña segura');
    const blocker = await pool.connect();
    let pending: ReturnType<typeof api> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock(725615870)');
      pending = api('auth/login', { username: 'mozo', password: config.DEMO_PASSWORD });
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const blocked = await pool.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query='SELECT pg_advisory_xact_lock(725615870)' AND pid<>$1",
          [(await blocker.query('SELECT pg_backend_pid() pid')).rows[0].pid],
        );
        if (blocked.rowCount) {
          waiting = true;
          break;
        }
        await setTimeout(50);
      }
      assert.ok(waiting, 'El login debe terminar de verificar antes del cambio de credenciales.');
      if (changed === 'password')
        await blocker.query('UPDATE users SET password_hash=$1 WHERE id=$2', [newHash, waiter]);
      else await blocker.query('UPDATE users SET active=false WHERE id=$1', [waiter]);
      await blocker.query('COMMIT');
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }
    const result = await pending!;
    assert.equal(result.status, 401);
    assert.equal(result.body.error?.code, 'LOGIN_FAILED');
    assert.equal(
      (await pool.query('SELECT id FROM sessions WHERE user_id=$1', [waiter])).rowCount,
      0,
    );
    assert.equal(result.cookie, undefined);
  });
