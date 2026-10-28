import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => /^(postgres(ql)?|mysql):/.test(v), 'Debe ser PostgreSQL o MySQL'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
  HOST: z.string().default('127.0.0.1'),
  BRANCH_TIMEZONE: z
    .string()
    .default('America/Argentina/Buenos_Aires')
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('es-AR', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Zona horaria no válida.'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ALLOWED_ORIGINS: z
    .string()
    .default(
      'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001',
    ),
  STORAGE_DIR: z.string().default('storage'),
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
  DEMO_PASSWORD: z.string().min(12).max(128).optional(),
  OPERATION_HASH_KEY: z.string().min(32).max(256),
});
export const env = schema.parse(process.env);
export const config = {
  ...env,
  origins: [
    ...env.ALLOWED_ORIGINS.split(',').map((v) => new URL(v.trim()).origin),
    ...[process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]
      .filter((host): host is string => process.env.VERCEL === '1' && Boolean(host))
      .map((host) => new URL(`https://${host}`).origin),
  ],
  storage: path.resolve(env.STORAGE_DIR),
  demo: env.DEMO_MODE === 'true',
};
