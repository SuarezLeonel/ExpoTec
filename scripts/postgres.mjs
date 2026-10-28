import EmbeddedPostgres from 'embedded-postgres';
import { access, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import pg from 'pg';
const port = Number(process.env.PGPORT);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error('PGPORT inválido.');
if (!process.env.PGPASSWORD || process.env.PGPASSWORD === 'CHANGE_ME')
  throw new Error('Ejecutá npm run setup.');
const directory = resolve(process.env.PGDATA || './data/postgres');
await mkdir(directory, { recursive: true });
const instance = new EmbeddedPostgres({
  databaseDir: directory,
  port,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  authMethod: 'scram-sha-256',
  persistent: true,
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: (message) => {
    if (String(message).includes('FATAL')) console.error('PostgreSQL:', String(message));
  },
});
try {
  await access(join(directory, 'PG_VERSION'));
} catch {
  console.log('Inicializando PostgreSQL local persistente…');
  await instance.initialise();
}
await instance.start();
const client = new pg.Client({
  host: '127.0.0.1',
  port,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: 'postgres',
});
await client.connect();
for (const database of ['baguette_demo', 'baguette_test']) {
  const result = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
  if (!result.rowCount) await client.query(`CREATE DATABASE ${database}`);
}
const version = await client.query('SELECT version()');
console.log(version.rows[0].version);
await client.end();
console.log(
  `PostgreSQL disponible en 127.0.0.1:${port}; datos: ${directory}. Ctrl+C para detener sin borrar.`,
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(keepalive);
  await instance.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
const keepalive = setInterval(() => {}, 30_000);
