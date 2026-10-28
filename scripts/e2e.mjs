import { spawn, spawnSync } from 'node:child_process';
import pg from 'pg';
import { mkdirSync } from 'node:fs';
const database = new URL(process.env.DATABASE_URL);
database.pathname = '/baguette_e2e';
if (process.env.DEMO_MODE !== 'true' || database.hostname !== '127.0.0.1')
  throw new Error('E2E requiere el PostgreSQL demo local.');
const port = Number(process.env.E2E_PORT || 3101);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || port === Number(process.env.PORT))
  throw new Error('E2E_PORT inválido o coincide con la demo.');
const connectionString = database.toString();
const administration = new URL(database);
administration.pathname = '/postgres';
const admin = new pg.Client({ connectionString: administration.toString() });
await admin.connect();
try {
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', ['baguette_e2e'])).rowCount)
    await admin.query('CREATE DATABASE baguette_e2e');
} finally {
  await admin.end();
}
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
} finally {
  await client.end();
}
console.log('Pruebas aisladas: solo se restauró baguette_e2e; baguette_demo se conserva.');
mkdirSync('data/e2e-storage', { recursive: true });
const environment = {
  ...process.env,
  DATABASE_URL: connectionString,
  PORT: String(port),
  HOST: '127.0.0.1',
  ALLOWED_ORIGINS: `http://127.0.0.1:${port}`,
  STORAGE_DIR: 'data/e2e-storage',
  E2E_BASE_URL: `http://127.0.0.1:${port}`,
};
function run(args, env = environment) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env, windowsHide: true });
  if (result.status !== 0) throw new Error(`Comprobación fallida (${result.status}).`);
}
run(['scripts/build.mjs']);
for (const file of ['migrate', 'seed']) run(['--import', 'tsx', `backend/src/database/${file}.ts`]);
const server = spawn(process.execPath, ['--import', 'tsx', 'backend/src/server.ts'], {
  env: environment,
  stdio: ['ignore', 'pipe', 'inherit'],
  windowsHide: true,
});
let ready = false;
server.stdout.on('data', (chunk) => {
  if (String(chunk).includes('disponible')) ready = true;
});
try {
  for (let attempt = 0; attempt < 100 && !ready; attempt++) {
    if (server.exitCode !== null) throw new Error('No se pudo iniciar API E2E.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('API E2E no inició a tiempo.');
  const result = spawnSync(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
    { stdio: 'inherit', env: environment, windowsHide: true },
  );
  process.exitCode = result.status ?? 1;
} finally {
  server.kill('SIGTERM');
}
