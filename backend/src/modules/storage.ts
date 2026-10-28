import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DB } from '../database/db.js';
import { one } from '../database/db.js';
import { config } from '../config/env.js';
import { ensure } from './errors.js';

export async function writeAsset(db: DB, name: string, content: Buffer | string) {
  await db.query('INSERT INTO binary_assets(path,content) VALUES($1,$2)', [
    name,
    Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'),
  ]);
}

export async function readAsset(db: DB, name: string): Promise<Buffer> {
  const asset = await one(db, 'SELECT content FROM binary_assets WHERE path=$1', [name]);
  if (asset) return asset.content as Buffer;
  // Preserve files created by local installations before migration 007.
  const absolute = path.resolve(config.storage, name);
  ensure(
    absolute.startsWith(`${config.storage}${path.sep}`),
    422,
    'FILE_PATH',
    'La ubicación del archivo no es válida.',
  );
  return readFile(absolute);
}
