import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { pool, transaction, type DB } from './db.js';

const sqlDir = fileURLToPath(new URL('../../sql/', import.meta.url));
async function migrateOn(db: DB) {
  await db.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const files = (await readdir(sqlDir))
    .filter((file) => /^\d+_/.test(file) && file.endsWith('.sql') && !file.includes('seed'))
    .sort();
  for (const name of files) {
    const applied = await db.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]);
    if (applied.rowCount) continue;
    await db.query(await readFile(path.join(sqlDir, name), 'utf8'));
    await db.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
  }
}
export async function migrate(db?: DB) {
  if (db) await migrateOn(db);
  else await transaction(migrateOn);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await migrate();
    process.stdout.write('Migraciones PostgreSQL aplicadas.\n');
  } finally {
    await pool.end();
  }
}
