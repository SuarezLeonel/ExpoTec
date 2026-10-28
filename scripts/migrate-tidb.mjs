import fs from 'node:fs';
import mysql from 'mysql2/promise';

async function migrateToTiDB() {
  console.log('--- Conectando a TiDB Cloud ---');
  const conn = await mysql.createConnection({
    host: 'gateway01.sa-east-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '2LTQVyUzsCxTKT7.root',
    password: 'KepPVDKGir9jiV1E',
    multipleStatements: true,
    ssl: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    },
  });

  console.log('✓ Conectado.');

  // Create database cafe_demo
  await conn.query(
    'CREATE DATABASE IF NOT EXISTS cafe_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
  );
  await conn.query('USE cafe_demo;');
  console.log('✓ Base de datos cafe_demo seleccionada en TiDB.');

  // Read SQL script
  const fullSql = fs.readFileSync('database_mysql.sql', 'utf8');

  // Clean statements
  // Filter out comments and split by semicolon
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

  console.log(`Ejecutando ${statements.length} sentencias SQL en TiDB Cloud...`);

  let count = 0;
  for (const stmt of statements) {
    // Skip USE or CREATE DATABASE as we already did that
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

  // Verify tables
  const [tables] = await conn.query('SHOW TABLES;');
  console.log(`✓ Tablas creadas en TiDB Cloud: ${tables.length}`);
  console.log(tables.map((t) => Object.values(t)[0]));

  // Verify users
  const [users] = await conn.query('SELECT username, role, name FROM users;');
  console.log('✓ Usuarios en TiDB:', users);

  await conn.end();
}

migrateToTiDB().catch((err) => {
  console.error('Fallo en migración a TiDB:', err);
  process.exit(1);
});
