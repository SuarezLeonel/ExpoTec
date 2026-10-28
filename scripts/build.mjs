import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
for (const args of [
  ['node_modules/typescript/bin/tsc', '-p', 'backend/tsconfig.json'],
  [
    'node_modules/vite/bin/vite.js',
    'build',
    '--config',
    'frontend/vite.config.ts',
    '--configLoader',
    'runner',
  ],
  ...(process.env.VERCEL_ENV === 'production'
    ? [['--import', 'tsx', 'backend/src/database/migrate.ts']]
    : []),
]) {
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, NODE_ENV: 'production' },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
const worker = await readFile('frontend/public/sw.js', 'utf8');
const hash = createHash('sha256').update(worker);
for (const asset of ['index.html', 'brand/baguette-logo.svg', 'brand/apollo.ttf'])
  hash.update(await readFile(`frontend/dist/${asset}`));
await writeFile(
  'frontend/dist/sw.js',
  worker.replace('__BUILD_ID__', hash.digest('hex').slice(0, 16)),
);
