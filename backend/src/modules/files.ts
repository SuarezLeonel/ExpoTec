import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DB } from '../database/db.js';
import { one } from '../database/db.js';
import { config } from '../config/env.js';
import { ensure } from './errors.js';
import { readAsset, writeAsset } from './storage.js';

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (v) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[v]!,
  );
}
export function htmlDocument(title: string, body: string): string {
  return `<!doctype html><html lang="es-AR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font:16px Arial,sans-serif;max-width:1000px;margin:2rem auto;padding:1rem;color:#183849;background:#fff}h1,h2{font-family:Georgia,serif}table{width:100%;border-collapse:collapse}td,th{text-align:left;border-bottom:1px solid #ccc;padding:.6rem}footer{margin-top:2rem}pre{white-space:pre-wrap}@media print{body{margin:0}}</style><h1>${escapeHtml(title)}</h1><p>Demostración. Sin validez fiscal. Datos y precios ficticios.</p>${body}<footer>Generado ${escapeHtml(new Date().toISOString())}. No acredita transacción bancaria ni impresión física.</footer></html>`;
}
export async function saveFile(
  db: DB,
  input: {
    name: string;
    kind: string;
    mime: string;
    content: string;
    userId?: string;
    entityId?: string;
    public?: boolean;
  },
) {
  const id = randomUUID();
  const relative = `exports/${id}.${input.mime === 'text/csv' ? 'csv' : 'html'}`;
  await writeAsset(db, relative, input.content);
  await db.query(
    'INSERT INTO stored_files(id,name,kind,mime,path,user_id,entity_id,public) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      id,
      input.name,
      input.kind,
      input.mime,
      relative,
      input.userId ?? null,
      input.entityId ?? null,
      input.public ?? false,
    ],
  );
  return { id, name: input.name, mime: input.mime };
}
export async function fileContent(db: DB, id: string, userId?: string, permissions: string[] = []) {
  const file = await one(db, 'SELECT * FROM stored_files WHERE id=$1', [id]);
  ensure(file, 404, 'FILE_NOT_FOUND', 'No se encontró el archivo.');
  const permitted =
    file.public ||
    permissions.includes('audit') ||
    (permissions.includes('cash') &&
      ['cash', 'account', 'invoice', 'ticket'].includes(file.kind as string));
  ensure(
    permitted,
    403,
    'FILE_FORBIDDEN',
    'Tu usuario no tiene permiso para descargar este archivo.',
  );
  const absolute = path.resolve(config.storage, file.path as string);
  ensure(
    absolute.startsWith(`${config.storage}${path.sep}`),
    422,
    'FILE_PATH',
    'La ubicación del archivo no es válida.',
  );
  const delivery = await one(
    db,
    'INSERT INTO file_deliveries(file_id,user_id) VALUES($1,$2) RETURNING id',
    [id, userId ?? null],
  );
  const data = await readAsset(db, file.path as string);
  return {
    id,
    name: file.name,
    mime: file.mime,
    content_base64: data.toString('base64'),
    _delivery_id: delivery!.id as string,
  };
}
