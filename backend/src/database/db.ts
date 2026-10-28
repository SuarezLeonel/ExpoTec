import pg, { type PoolClient, type QueryResultRow } from 'pg';
import { config } from '../config/env.js';

pg.types.setTypeParser(20, (value: string) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Importe fuera del rango exacto');
  return number;
});
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
pool.on('error', () => process.stderr.write('Se perdió una conexión inactiva a PostgreSQL.\n'));
export type DB = Pick<PoolClient, 'query'>;
export async function rows<T extends QueryResultRow = QueryResultRow>(
  db: DB,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}
export async function one<T extends QueryResultRow = QueryResultRow>(
  db: DB,
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  return (await rows<T>(db, sql, params))[0];
}
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  write = true,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    // A branch has one serialized command stream; row versions still reject stale clients.
    if (write) await client.query('SELECT pg_advisory_xact_lock(725615870)');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
