import fs from 'node:fs';
import mysql from 'mysql2/promise';

function getConnectionConfig() {
  const dbUrlStr = process.env.DATABASE_URL || '';
  if (dbUrlStr.startsWith('mysql:')) {
    const dbUrl = new URL(dbUrlStr);
    const useSsl =
      dbUrl.hostname !== '127.0.0.1' &&
      dbUrl.hostname !== 'localhost' &&
      dbUrl.searchParams.get('ssl') !== 'false';
    return {
      host: dbUrl.hostname,
      port: dbUrl.port ? Number(dbUrl.port) : 4000,
      user: dbUrl.username,
      password: decodeURIComponent(dbUrl.password),
      database: dbUrl.pathname.replace(/^\//, '') || 'cafe_demo',
      multipleStatements: true,
      ...(useSsl ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } } : {}),
    };
  }

  const host = process.env.TIDB_HOST || process.env.MYSQL_HOST || process.env.DB_HOST;
  const user = process.env.TIDB_USER || process.env.MYSQL_USER || process.env.DB_USER;
  const password =
    process.env.TIDB_PASSWORD || process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD;
  const port = Number(
    process.env.TIDB_PORT || process.env.MYSQL_PORT || process.env.DB_PORT || 4000,
  );
  const database =
    process.env.TIDB_DATABASE ||
    process.env.MYSQL_DATABASE ||
    process.env.DB_DATABASE ||
    'cafe_demo';

  if (!host || !user || password === undefined) {
    throw new Error(
      'Faltan variables de entorno para conectar a la base de datos MySQL/TiDB.\n' +
        'Configurá DATABASE_URL=mysql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DATABASE> en .env o definí TIDB_HOST, TIDB_USER y TIDB_PASSWORD.',
    );
  }

  const useSsl = host !== '127.0.0.1' && host !== 'localhost';
  return {
    host,
    port,
    user,
    password,
    database,
    multipleStatements: true,
    ...(useSsl ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } } : {}),
  };
}

async function migrateToTiDB() {
  const config = getConnectionConfig();
  console.log(`--- Conectando a MySQL/TiDB (${config.host}:${config.port}) ---`);

  // Conectar inicialmente sin especificar base para asegurar existencia
  const { database, ...initOptions } = config;
  const conn = await mysql.createConnection(initOptions);

  console.log('✓ Conectado al servidor.');

  const targetDb = database || 'cafe_demo';
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${targetDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  );
  await conn.query(`USE \`${targetDb}\`;`);
  console.log(`✓ Base de datos ${targetDb} seleccionada.`);

  // Localizar script SQL
  const candidatePaths = ['database_mysql.sql', 'backend/sql/database_mysql.sql'];
  const sqlFile = candidatePaths.find((p) => fs.existsSync(p));
  if (!sqlFile) {
    throw new Error('No se encontró el archivo de migración database_mysql.sql.');
  }

  const fullSql = fs.readFileSync(sqlFile, 'utf8');

  // Filtrar comentarios y separar sentencias
  const lines = fullSql.split('\n');
  let currentStmt = '';
  const statements = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') || trimmed.length === 0) continue;
    currentStmt += line + '\n';
    if (trimmed.endsWith(';')) {
      statements.push(currentStmt.trim());
      currentStmt = '';
    }
  }
  if (currentStmt.trim().length > 0) {
    statements.push(currentStmt.trim());
  }

  console.log(`Ejecutando ${statements.length} sentencias SQL en ${targetDb}...`);

  let count = 0;
  for (const stmt of statements) {
    if (
      /^CREATE\s+DATABASE/i.test(stmt) ||
      /^USE\s+/i.test(stmt) ||
      /^DROP\s+DATABASE/i.test(stmt)
    ) {
      continue;
    }
    try {
      await conn.query(stmt);
      count++;
    } catch (err) {
      console.error(`Error ejecutando sentencia:\n${stmt.slice(0, 150)}...\nError: ${err.message}`);
      throw err;
    }
  }

  console.log(`✓ Se ejecutaron ${count} sentencias con éxito.`);

  // Verificar tablas
  const [tables] = await conn.query('SHOW TABLES;');
  console.log(`✓ Tablas creadas: ${tables.length}`);

  // Verificar usuarios
  const [users] = await conn.query('SELECT username, role, name FROM users;');
  console.log(`✓ Usuarios registrados: ${users.length}`);

  await conn.end();
}

migrateToTiDB().catch((err) => {
  console.error('Fallo en migración a MySQL/TiDB:', err.message);
  process.exit(1);
});
