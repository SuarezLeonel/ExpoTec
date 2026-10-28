import { randomBytes } from 'node:crypto';
import { readFile, writeFile, access, appendFile } from 'node:fs/promises';
try {
  await access('.env');
  const existing = await readFile('.env', 'utf8');
  if (!/^OPERATION_HASH_KEY=.+$/m.test(existing))
    await appendFile('.env', '\nOPERATION_HASH_KEY=' + randomBytes(32).toString('hex') + '\n');
  console.log('.env existente conservado; configuración requerida completa.');
} catch {
  const password = randomBytes(24).toString('hex');
  const template = await readFile('.env.example', 'utf8');
  await writeFile(
    '.env',
    template
      .replaceAll('CHANGE_ME', password)
      .replace('GENERATE_OPERATION_HASH_KEY', randomBytes(32).toString('hex')),
    { flag: 'wx' },
  );
  console.log('.env creado con secretos aleatorios para la base local y la idempotencia.');
}
