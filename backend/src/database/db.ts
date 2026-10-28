import crypto from 'node:crypto';
import pg, { type QueryResultRow } from 'pg';
import mysql, { type Pool as MysqlPool, type PoolConnection } from 'mysql2/promise';
import { config } from '../config/env.js';

export interface DBResult<T = QueryResultRow> {
  rows: T[];
  rowCount: number;
}

export interface DB {
  query<T = QueryResultRow>(sql: string, params?: unknown[]): Promise<DBResult<T>>;
}

export interface ClientWithDB extends DB {
  release(): void;
}

const isMysql = config.DATABASE_URL.startsWith('mysql:');

let pgPool: pg.Pool | undefined;
let mysqlPool: MysqlPool | undefined;

if (isMysql) {
  const dbUrl = new URL(config.DATABASE_URL);
  const useSsl =
    dbUrl.hostname !== '127.0.0.1' &&
    dbUrl.hostname !== 'localhost' &&
    dbUrl.searchParams.get('ssl') !== 'false';

  mysqlPool = mysql.createPool({
    host: dbUrl.hostname,
    port: dbUrl.port ? Number(dbUrl.port) : 3306,
    user: dbUrl.username,
    password: decodeURIComponent(dbUrl.password),
    database: dbUrl.pathname.replace(/^\//, ''),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ...(useSsl ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } } : {}),
    typeCast: function (field, next) {
      if (field.type === 'TINY' && field.length === 1) {
        const val = field.string();
        return val === null ? null : val === '1';
      }
      if (field.type === 'NEWDECIMAL' || field.type === 'DECIMAL' || field.type === 'LONGLONG') {
        const val = field.string();
        if (val === null) return null;
        const num = Number(val);
        if (!Number.isSafeInteger(num)) throw new Error('Importe fuera del rango exacto');
        return num;
      }
      if (field.type === 'JSON') {
        const val = field.string('utf8');
        if (val === null) return null;
        try {
          return JSON.parse(val);
        } catch {
          return val;
        }
      }
      return next();
    },
  });
} else {
  pg.types.setTypeParser(20, (value: string) => {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error('Importe fuera del rango exacto');
    return number;
  });

  pgPool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  pgPool.on('error', () => process.stderr.write('Se perdió una conexión inactiva a PostgreSQL.\n'));
}

async function executeMysql<T = QueryResultRow>(
  target: MysqlPool | PoolConnection,
  sql: string,
  params: unknown[] = [],
): Promise<DBResult<T>> {
  let s = sql.trim();
  const p = [...params];

  // Advisory lock emulation
  if (/^SELECT\s+pg_advisory_xact_lock/i.test(s)) {
    const [res] = await target.query("SELECT GET_LOCK('gestion_cafe_xact', 10)");
    return { rows: res as T[], rowCount: 1 };
  }

  // Handle table_groups DEFAULT VALUES
  if (/INSERT\s+INTO\s+table_groups\s+DEFAULT\s+VALUES/i.test(s)) {
    const newId = crypto.randomUUID();
    await target.query('INSERT INTO table_groups(id) VALUES(?)', [newId]);
    return { rows: [{ id: newId }] as unknown as T[], rowCount: 1 };
  }

  // Check for RETURNING clause
  const returningMatch = s.match(/\s+RETURNING\s+([\s\S]+)$/i);
  let returningFields: string | null = null;
  if (returningMatch) {
    returningFields = returningMatch[1].trim();
    s = s.slice(0, returningMatch.index).trim();
  }

  // ON CONFLICT DO NOTHING
  s = s.replace(
    /ON\s+CONFLICT\s*(\([a-zA-Z0-9_, ]+\))?\s+DO\s+NOTHING/gi,
    'ON DUPLICATE KEY UPDATE id=id',
  );

  // ON CONFLICT(...) DO UPDATE SET ...
  s = s.replace(
    /ON\s+CONFLICT\s*\([a-zA-Z0-9_, ]+\)\s+DO\s+UPDATE\s+SET\s+([\s\S]+?)$/gi,
    (_, updateBody) => {
      const mysqlUpdate = updateBody.replace(/excluded\.([a-zA-Z0-9_]+)/g, 'VALUES($1)');
      return `ON DUPLICATE KEY UPDATE ${mysqlUpdate}`;
    },
  );

  // Interval arithmetic
  s = s.replace(
    /now\(\)\s*([+-])\s*interval\s*'(\d+)\s*(minute|hour|day)s?'/gi,
    (_, sign, num, unit) => {
      return sign === '-'
        ? `DATE_SUB(NOW(), INTERVAL ${num} ${unit.toUpperCase()})`
        : `DATE_ADD(NOW(), INTERVAL ${num} ${unit.toUpperCase()})`;
    },
  );
  s = s.replace(/now\(\)\s*\+\s*interval\s*'(\d+)\s*(minute|hour|day)s?'/gi, (_, num, unit) => {
    return `DATE_ADD(NOW(), INTERVAL ${num} ${unit.toUpperCase()})`;
  });
  s = s.replace(/interval\s*'(\d+)\s*(minute|hour|day)s?'/gi, (_, num, unit) => {
    return `INTERVAL ${num} ${unit.toUpperCase()}`;
  });
  s = s.replace(/\bclock_timestamp\(\)/gi, 'NOW()');

  // Typecasts
  s = s.replace(/::(uuid(\[\])?|text(\[\])?|integer|int|bigint|boolean|jsonb?)/gi, '');

  // ANY array comparisons
  s = s.replace(
    /NOT\s*\(\s*([a-zA-Z0-9_.]+)\s*=\s*ANY\s*\(\s*\$(\d+)\s*\)\s*\)/gi,
    '$1 NOT IN ($$$2)',
  );
  s = s.replace(/([a-zA-Z0-9_.]+)\s*=\s*ANY\s*\(\s*\$(\d+)\s*\)/gi, '$1 IN ($$$2)');

  // ARRAY(SELECT ...) emulation
  s = s.replace(
    /ARRAY\(\s*SELECT\s+([\s\S]+?)\s*\)/gi,
    'COALESCE((SELECT JSON_ARRAYAGG($1)), JSON_ARRAY())',
  );

  // JSON functions
  s = s.replace(
    /json_agg\(\s*pr\s*\)/gi,
    "JSON_ARRAYAGG(JSON_OBJECT('id', pr.id, 'refund_id', pr.refund_id, 'item_id', pr.item_id, 'quantity', pr.quantity))",
  );
  s = s.replace(
    /json_agg\(([\s\S]+?)\s+ORDER\s+BY\s+[a-zA-Z0-9_.]+(\s+(ASC|DESC))?\)/gi,
    'JSON_ARRAYAGG($1)',
  );
  s = s.replace(
    /JSON_ARRAYAGG\(([\s\S]+?)\s+ORDER\s+BY\s+[a-zA-Z0-9_.]+(\s+(ASC|DESC))?\)/gi,
    'JSON_ARRAYAGG($1)',
  );
  s = s.replace(/json_agg\(/gi, 'JSON_ARRAYAGG(');
  s = s.replace(/json_build_object\(/gi, 'JSON_OBJECT(');
  s = s.replace(/jsonb_build_object\(/gi, 'JSON_OBJECT(');
  s = s.replace(/jsonb_agg\(/gi, 'JSON_ARRAYAGG(');

  // Materialized CTE
  s = s.replace(/\bAS\s+MATERIALIZED\b/gi, 'AS');

  // Track ID for RETURNING emulation
  let insertTable: string | null = null;
  let insertId: string | null = null;
  let updateTable: string | null = null;
  let updateId: string | number | null = null;

  if (returningFields) {
    const insertMatch = s.match(
      /^INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
    );
    if (insertMatch) {
      insertTable = insertMatch[1];
      const cols = insertMatch[2].split(',').map((c) => c.trim().toLowerCase());
      const valPlaceholders = insertMatch[3].split(',').map((v) => v.trim());
      const idColIdx = cols.indexOf('id');
      if (idColIdx !== -1) {
        const placeholder = valPlaceholders[idColIdx];
        const m = placeholder.match(/\$(\d+)/);
        if (m) {
          insertId = p[parseInt(m[1], 10) - 1] as string;
        }
      } else {
        insertId = crypto.randomUUID();
        const newCols = `id, ${insertMatch[2]}`;
        const newVals = `?, ${insertMatch[3]}`;
        s = s.replace(
          new RegExp(
            `\\(${insertMatch[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\s*VALUES\\s*\\(${insertMatch[3].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
            'i',
          ),
          `(${newCols}) VALUES (${newVals})`,
        );
      }
    } else {
      const updateMatch = s.match(
        /^UPDATE\s+([a-zA-Z0-9_]+)\s+SET[\s\S]+?WHERE\s+id\s*=\s*(\$?\d+)/i,
      );
      if (updateMatch) {
        updateTable = updateMatch[1];
        if (updateMatch[2].startsWith('$')) {
          const paramIdx = parseInt(updateMatch[2].slice(1), 10) - 1;
          updateId = p[paramIdx] as string | number;
        } else {
          updateId = parseInt(updateMatch[2], 10);
        }
      }
    }
  }

  // Convert $1, $2, ... to ?
  const adaptedParams: unknown[] = [];
  if (returningFields && insertTable && insertId && !sql.toLowerCase().includes('(id,')) {
    adaptedParams.push(insertId);
  }
  s = s.replace(/\$(\d+)/g, (_, idxStr) => {
    const idx = parseInt(idxStr, 10) - 1;
    const val = p[idx];
    if (Array.isArray(val) && val.length === 0) {
      adaptedParams.push(null);
    } else if (
      val !== null &&
      typeof val === 'object' &&
      !(val instanceof Date) &&
      !Buffer.isBuffer(val) &&
      !Array.isArray(val)
    ) {
      adaptedParams.push(JSON.stringify(val));
    } else {
      adaptedParams.push(val);
    }
    return '?';
  });

  const [res] = await target.query(s, adaptedParams);

  if (returningFields) {
    const targetId = insertId ?? updateId;
    const targetTable = insertTable ?? updateTable;
    if (targetTable && targetId !== null && targetId !== undefined) {
      const selectFields = returningFields === '*' ? '*' : returningFields;
      const [rows] = await target.query(`SELECT ${selectFields} FROM ${targetTable} WHERE id = ?`, [
        targetId,
      ]);
      return { rows: rows as T[], rowCount: (rows as unknown[]).length };
    }
    if (returningFields === 'id' && insertId) {
      return { rows: [{ id: insertId }] as unknown as T[], rowCount: 1 };
    }
  }

  if (Array.isArray(res)) {
    return { rows: res as T[], rowCount: res.length };
  } else {
    return { rows: [] as T[], rowCount: (res as mysql.ResultSetHeader).affectedRows ?? 0 };
  }
}

export const pool = {
  async query<T = QueryResultRow>(sql: string, params: unknown[] = []): Promise<DBResult<T>> {
    if (isMysql) {
      return executeMysql<T>(mysqlPool!, sql, params);
    } else {
      const res = await pgPool!.query<T extends QueryResultRow ? T : QueryResultRow>(sql, params);
      return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
    }
  },
  async connect(): Promise<ClientWithDB> {
    if (isMysql) {
      const conn = await mysqlPool!.getConnection();
      return {
        query: <T = QueryResultRow>(sql: string, params: unknown[] = []) =>
          executeMysql<T>(conn, sql, params),
        release: () => conn.release(),
      };
    } else {
      const client = await pgPool!.connect();
      return {
        query: async <T = QueryResultRow>(sql: string, params: unknown[] = []) => {
          const res = await client.query<T extends QueryResultRow ? T : QueryResultRow>(
            sql,
            params,
          );
          return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
        },
        release: () => client.release(),
      };
    }
  },
  async end(): Promise<void> {
    if (isMysql) {
      await mysqlPool!.end();
    } else {
      await pgPool!.end();
    }
  },
  on(_event: string, _handler: (...args: unknown[]) => void) {
    // Event listeners
  },
};

export async function rows<T = QueryResultRow>(
  db: DB,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

export async function one<T = QueryResultRow>(
  db: DB,
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  return (await rows<T>(db, sql, params))[0];
}

export async function transaction<T>(fn: (client: DB) => Promise<T>, write = true): Promise<T> {
  const client = await pool.connect();
  try {
    if (isMysql) {
      await client.query('START TRANSACTION');
      if (write) await client.query('SELECT pg_advisory_xact_lock(725615870)');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } else {
      await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      if (write) await client.query('SELECT pg_advisory_xact_lock(725615870)');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    if (isMysql && write) {
      await client.query("SELECT RELEASE_LOCK('gestion_cafe_xact')").catch(() => {});
    }
    client.release();
  }
}
