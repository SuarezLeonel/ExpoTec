import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
if (
  process.env.DEMO_MODE !== 'true' ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith('/baguette_demo')
)
  throw new Error('Restauración limitada a baguette_demo en DEMO_MODE.');
const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
const answer = await prompt.question(
  'Se borrarán SOLO los datos ficticios de baguette_demo. Escribí RESTAURAR DEMO: ',
);
prompt.close();
if (answer !== 'RESTAURAR DEMO') {
  console.log('Cancelado.');
  process.exit(1);
}
const pg = await import('pg');
const client = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
await client.end();
for (const file of ['migrate', 'seed']) {
  const result = spawnSync(
    process.execPath,
    ['--env-file=.env', '--import', 'tsx', `backend/src/database/${file}.ts`],
    { stdio: 'inherit' },
  );
  if (result.status) process.exit(result.status);
}
console.log(
  'Datos demo restaurados. Historial de esta base demo reemplazado con confirmación explícita.',
);
