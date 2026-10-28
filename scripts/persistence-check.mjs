import { spawnSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import pg from 'pg';
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseDir = resolve(process.env.PGDATA || './data/postgres');
const databaseUrl = new URL(process.env.DATABASE_URL);
if (
  process.env.DEMO_MODE !== 'true' ||
  databaseUrl.hostname !== '127.0.0.1' ||
  databaseUrl.pathname !== '/baguette_demo' ||
  !databaseDir.startsWith(repository + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'))
)
  throw new Error(
    'La verificación de reinicio solo admite el cluster demo local dentro del proyecto.',
  );
const binary = join(
  repository,
  'node_modules',
  '@embedded-postgres',
  process.platform === 'win32' ? 'windows-x64' : `${process.platform}-${process.arch}`,
  'native',
  'bin',
  process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl',
);
if (!existsSync(binary))
  throw new Error('Binario local no disponible; no se reinicia un PostgreSQL externo.');
async function fingerprint() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      "SELECT (SELECT count(*) FROM accounts)::int accounts,(SELECT count(*) FROM items)::int items,(SELECT coalesce(sum(amount_cents),0)::text FROM payments) paid_cents,(SELECT count(*) FROM operations)::int operations,(SELECT md5(coalesce(string_agg(id::text || result::text, '' ORDER BY id),'')) FROM operations) operation_fingerprint",
    );
    return result.rows[0];
  } finally {
    await client.end();
  }
}
const before = await fingerprint();
const restart = spawnSync(
  binary,
  [
    'restart',
    '-D',
    databaseDir,
    '-w',
    '-t',
    '30',
    '-m',
    'fast',
    '-l',
    join(repository, 'data', 'restart-check.log'),
  ],
  { stdio: 'ignore', windowsHide: true },
);
if (restart.status !== 0) throw new Error(`No se pudo reiniciar PostgreSQL: ${restart.stderr}`);
const after = await fingerprint();
if (JSON.stringify(before) !== JSON.stringify(after))
  throw new Error('La huella persistente cambió después del reinicio.');
mkdirSync(join(repository, 'test-results'), { recursive: true });
writeFileSync(
  join(repository, 'test-results', 'persistence.json'),
  JSON.stringify(
    { tested_at: new Date().toISOString(), database: 'baguette_demo', before, after, passed: true },
    null,
    2,
  ),
);
console.log('Persistencia tras reinicio REAL de PostgreSQL comprobada:', after);
