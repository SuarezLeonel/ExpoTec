import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import pg from 'pg';

const database = new URL(process.env.TEST_DATABASE_URL || 'about:blank');
assert.equal(database.hostname, '127.0.0.1');
assert.equal(database.pathname, '/baguette_test');
process.env.DATABASE_URL = database.href;
process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'true';
const delay = Number(process.argv[2] || 0);
const output = resolve(process.argv[3] || 'test-results/pin-benchmark.json');
assert.ok(Number.isInteger(delay) && delay >= 0 && delay <= 500);
const { pool } = await import('../backend/src/database/db.ts');
const { migrate } = await import('../backend/src/database/migrate.ts');
const { seed } = await import('../backend/src/database/seed.ts');
await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
await migrate();
await seed();
const initStart = performance.now();
const { createApp } = await import('../backend/src/app.ts');
const { config } = await import('../backend/src/config/env.ts');
const moduleInitMs = performance.now() - initStart;
const server = createApp().listen(0, '127.0.0.1');
await new Promise((done) => server.once('listening', done));
const url = `http://127.0.0.1:${server.address().port}`;
const headers = {
  'Content-Type': 'application/json',
  Origin: config.origins[0],
  'X-Session-Mode': 'terminal',
};
let measuring = false;
let queries = 0;
const query = pg.Client.prototype.query;
pg.Client.prototype.query = function (...args) {
  if (!measuring) return query.apply(this, args);
  queries++;
  if (!delay) return query.apply(this, args);
  const callback = typeof args.at(-1) === 'function' ? args.pop() : null;
  if (callback) return setTimeout(() => query.call(this, ...args, callback), delay);
  return new Promise((done, fail) =>
    setTimeout(() => query.apply(this, args).then(done, fail), delay),
  );
};
try {
  const response = await fetch(`${url}/api/auth/terminal`, { method: 'POST', headers, body: '{}' });
  assert.ok(response.ok);
  const session = await response.json();
  headers.Cookie = response.headers.get('set-cookie').split(';')[0];
  headers['X-CSRF-Token'] = session.csrf;
  const samples = [];
  for (let index = 0; index < 15; index++) {
    queries = 0;
    measuring = true;
    const start = performance.now();
    const result = await fetch(`${url}/api/auth/operational-pin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ table_id: '40000000-0000-4000-8000-000000000001', pin: '4303' }),
    });
    const body = await result.json();
    const milliseconds = performance.now() - start;
    measuring = false;
    assert.equal(result.status, 200);
    assert.equal(body.operator.id, '50000000-0000-4000-8000-000000000003');
    assert.ok(body.table_state);
    samples.push({ milliseconds: Number(milliseconds.toFixed(1)), queries });
  }
  const sorted = samples
    .slice(1)
    .map((sample) => sample.milliseconds)
    .sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.ceil(p * sorted.length) - 1];
  const result = {
    measuredAt: new Date().toISOString(),
    method:
      'Isolated local HTTP API and PostgreSQL, fixed added delay per SQL round trip; no deployed-site claim. One cold verification then 14 warm requests. No PIN, verifier or token in artifact.',
    database: database.pathname.slice(1),
    addedRoundTripMs: delay,
    moduleInitMs: Number(moduleInitMs.toFixed(1)),
    first: samples[0],
    warm: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) },
    samples,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  measuring = false;
  pg.Client.prototype.query = query;
  await new Promise((done) => server.close(done));
  await pool.end();
}
