import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import express, { type ErrorRequestHandler, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import sharp from 'sharp';
import { z } from 'zod';
import { config } from './config/env.js';
import { one, pool, rows, transaction } from './database/db.js';
import { seed } from './database/seed.js';
import { authenticate, csrf, managementOnly, requirePermission } from './middleware/auth.js';
import {
  checkOperationTable,
  requireOperationalPin,
  resolveOperator,
  terminalCommandAllowed,
} from './modules/operational-pin.js';
import { authRouter, throttle } from './modules/auth.js';
import { ApiError, ensure } from './modules/errors.js';
import { accountCommands } from './modules/account-commands.js';
import { catalogCommands } from './modules/catalog-commands.js';
import { floorPlanCommands } from './modules/floor-plan-commands.js';
import { financialCommands, selectedQuote } from './modules/financial-commands.js';
import { orderCommands } from './modules/order-commands.js';
import { serviceCommands } from './modules/service-commands.js';
import { canonical, operationHash, sha256 } from './modules/security.js';
import { commandAccess, replayScope } from './modules/command-access.js';
import { account } from './modules/account-data.js';
import { cashSummary } from './modules/cash-data.js';
import { escapeHtml, fileContent, htmlDocument, saveFile } from './modules/files.js';
import { menu, state } from './modules/queries.js';
import { splitCents } from './modules/money.js';
import { selections, uuid } from './modules/validation.js';
import { auditEvent } from './modules/audit.js';
import type { AuthRequest, CommandContext } from './modules/types.js';
import { mayResetDemo } from './modules/demo-guard.js';
import { readAsset, writeAsset } from './modules/storage.js';

const commands = {
  ...accountCommands,
  ...catalogCommands,
  ...floorPlanCommands,
  ...financialCommands,
  ...orderCommands,
  ...serviceCommands,
};
function deliverFile(res: Response, file: Awaited<ReturnType<typeof fileContent>>) {
  const { _delivery_id: deliveryId, ...payload } = file;
  res.once('finish', () => {
    if (res.statusCode < 400)
      void pool
        .query('UPDATE file_deliveries SET delivered_at=now() WHERE id=$1', [deliveryId])
        .catch(() => process.stderr.write('No se pudo registrar la entrega HTTP del archivo.\n'));
  });
  res.json(payload);
}
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || config.origins.includes(origin));
      },
      credentials: true,
    }),
  );
  app.use('/api', (req, _res, next) => {
    const origin = req.get('Origin');
    if (origin && !config.origins.includes(origin))
      return next(
        new ApiError(403, 'ORIGIN_FORBIDDEN', 'El origen de esta solicitud no está permitido.'),
      );
    if (req.get('Sec-Fetch-Site') === 'cross-site')
      return next(new ApiError(403, 'ORIGIN_FORBIDDEN', 'La solicitud proviene de otro sitio.'));
    next();
  });
  app.use(cookieParser());
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const limitMessage = {
    error: {
      code: 'RATE_LIMIT',
      message: 'Demasiadas solicitudes. Esperá un minuto antes de volver a intentar.',
    },
  };
  app.use(
    '/api/public',
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: limitMessage,
    }),
  );
  // Authorize uploads before reading their larger body or decoding image pixels.
  app.use(
    '/api/products/image',
    authenticate,
    csrf,
    managementOnly,
    requirePermission('manage_catalog'),
    rateLimit({
      windowMs: 60_000,
      limit: 12,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: limitMessage,
    }),
    express.json({ limit: '6mb', strict: true }),
  );
  app.use(express.json({ limit: '128kb', strict: true }));
  app.use('/api/auth', authRouter);
  app.post('/api/public/menu', async (_req, res) => res.json(await transaction(menu, false)));
  app.post('/api/public/menu/print', async (req, res) => {
    await throttle(req.ip ?? 'local', 'public-export', 30);
    const result = await transaction(async (db) => {
      const data = await menu(db);
      const sections = data.categories
        .filter((c) => !c.parent_id)
        .map(
          (category) =>
            `<h2>${escapeHtml(category.name)}</h2>${[
              category,
              ...data.categories.filter((c) => c.parent_id === category.id),
            ]
              .filter((c) => data.products.some((p) => p.category_id === c.id))
              .map(
                (section) =>
                  `${section.parent_id ? `<h3>${escapeHtml(section.name)}</h3>` : ''}<table><thead><tr><th>Producto / variante</th><th>Descripción</th><th>Precio ARS</th></tr></thead><tbody>${data.products
                    .filter((product) => product.category_id === section.id)
                    .map(
                      (product) =>
                        `<tr><td>${escapeHtml(product.variant_group ? `${product.variant_group} · ${product.variant_name}` : product.name)}${product.available ? '' : ' (sin disponibilidad)'}</td><td>${escapeHtml(product.description)}</td><td>${((product.price_cents as number) / 100).toFixed(2)}</td></tr>`,
                    )
                    .join('')}</tbody></table>`,
              )
              .join('')}`,
        )
        .join('');
      const generated = await saveFile(db, {
        name: 'carta-demostracion.html',
        kind: 'menu',
        mime: 'text/html',
        public: true,
        content: htmlDocument('Carta de demostración Baguette', sections),
      });
      return fileContent(db, generated.id);
    });
    deliverFile(res, result);
  });
  app.post('/api/state', authenticate, async (req, res) => {
    const auth = req as AuthRequest;
    const value = await transaction(async (db) => {
      if (auth.mode === 'terminal' && req.get('X-Operation-Token')) {
        const identity = await resolveOperator(db, auth, req.get('X-Operation-Token'));
        const scoped = Object.create(auth) as AuthRequest;
        scoped.permissions = ['terminal_view', ...identity.permissions];
        scoped.operator = identity.user;
        scoped.grantTableId = identity.tableId;
        return state(db, scoped);
      }
      return state(db, auth);
    }, false);
    res.json(value);
  });
  app.post('/api/cash/summary', authenticate, async (req, res) => {
    const auth = req as AuthRequest;
    res.json(
      await transaction(async (db) => {
        const identity = await resolveOperator(db, auth, req.get('X-Operation-Token'));
        ensure(
          identity.permissions.includes('cash'),
          403,
          'FORBIDDEN',
          'Tu usuario no tiene permiso para consultar caja.',
        );
        return cashSummary(db);
      }),
    );
  });
  app.post('/api/accounts/quote', authenticate, async (req, res) => {
    const input = z
      .object({
        account_id: uuid,
        parts: z.number().int().min(2).max(30).optional(),
        selections: selections.optional(),
      })
      .parse(req.body);
    const auth = req as AuthRequest;
    res.json(
      await transaction(async (db) => {
        const identity = await resolveOperator(db, auth, req.get('X-Operation-Token'));
        ensure(
          identity.permissions.includes('cash'),
          403,
          'FORBIDDEN',
          'Tu usuario no tiene permiso para cobrar.',
        );
        if (auth.mode === 'terminal') await checkOperationTable(db, identity, 'payment.add', input);
        const ctx: CommandContext = {
          db,
          user: identity.user,
          permissions: identity.permissions,
          operationId: randomUUID(),
          mode: auth.mode,
        };
        const current = await account(ctx, input.account_id);
        const plan = await one(db, 'SELECT * FROM payment_plans WHERE account_id=$1', [current.id]);
        if (input.parts && plan)
          ensure(
            plan.parts === input.parts,
            409,
            'SPLIT_PLAN_EXISTS',
            'La cantidad de partes ya fue fijada.',
          );
        return {
          parts: input.parts
            ? splitCents(
                (plan?.base_cents as number | undefined) ?? current.balance_cents,
                input.parts,
              )
            : [],
          paid_parts: plan
            ? (await rows(db, 'SELECT part FROM payments WHERE plan_id=$1', [plan.id])).map(
                (p) => p.part,
              )
            : [],
          amount_cents: input.selections
            ? (await selectedQuote(ctx, current, input.selections)).amount_cents
            : current.balance_cents,
        };
      }),
    );
  });
  app.post('/api/commands/:action', authenticate, csrf, async (req, res) => {
    const action = String(req.params.action);
    const handler = Object.hasOwn(commands, action) ? commands[action] : undefined;
    ensure(handler, 404, 'COMMAND_NOT_FOUND', 'La operación no existe.');
    const key = uuid.parse(req.get('Idempotency-Key'));
    const auth = req as AuthRequest;
    if (
      req.body &&
      typeof req.body === 'object' &&
      'authorization' in req.body &&
      req.body.authorization
    )
      await throttle(
        `${req.ip ?? 'local'}:${auth.mode === 'terminal' ? auth.sessionId : auth.user.id}`,
        'secondary-authorization',
        15,
      );
    const content = canonical({ action, data: req.body });
    const contentHash = `hmac:v1:${operationHash(content, config.OPERATION_HASH_KEY)}`;
    const result = await transaction(async (db) => {
      const identity = await resolveOperator(db, auth, req.get('X-Operation-Token'));
      if (auth.mode === 'terminal') terminalCommandAllowed(action);
      commandAccess(action, identity.permissions, req.body);
      if (auth.mode === 'terminal') {
        const existingOwner = await one(
          db,
          'SELECT user_id FROM operations WHERE operation_key=$1 LIMIT 1',
          [key],
        );
        ensure(
          !existingOwner || existingOwner.user_id === identity.user.id,
          409,
          'OPERATION_OWNER_MISMATCH',
          'Esta operación pertenece a otro empleado. Identificá a su responsable antes de consultar o reintentar.',
        );
      }
      const previous = await one(
        db,
        'SELECT * FROM operations WHERE user_id=$1 AND operation_key=$2',
        [identity.user.id, key],
      );
      if (previous) {
        if (auth.mode === 'terminal')
          ensure(
            previous.table_id === identity.tableId,
            403,
            'PIN_REQUIRED',
            'Identificate en la mesa original de esta operación.',
            { table_id: previous.table_id },
          );
        const expectedHash = String(previous.content_hash).startsWith('hmac:v1:')
          ? contentHash
          : sha256(content);
        ensure(
          previous.content_hash === expectedHash && previous.action === action,
          409,
          'IDEMPOTENCY_CONFLICT',
          'Esta clave ya se usó con otro contenido. Revisá la operación antes de generar una nueva.',
        );
        ensure(
          !previous.access_permission ||
            identity.permissions.includes(previous.access_permission as string),
          403,
          'FORBIDDEN',
          'Ya no tenés permiso para consultar este resultado.',
        );
        return { result: previous.result, operation_id: previous.id, replayed: true };
      }
      const tableId =
        auth.mode === 'terminal' ? await checkOperationTable(db, identity, action, req.body) : null;
      await requireOperationalPin(db, auth, action, req.body, req.get('X-Operation-Token'));
      const operationId = randomUUID();
      const ctx: CommandContext = {
        db,
        user: identity.user,
        permissions: identity.permissions,
        operationId,
        mode: auth.mode,
      };
      const value = await handler(ctx, req.body);
      const permission = replayScope(
        action,
        identity.permissions,
        req.body as Record<string, unknown>,
        value,
      );
      await db.query(
        'INSERT INTO operations(id,user_id,operation_key,action,access_permission,content_hash,result,table_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [operationId, identity.user.id, key, action, permission, contentHash, value, tableId],
      );
      return { result: value, operation_id: operationId, replayed: false };
    });
    res.json(result);
  });
  app.post('/api/operations/lookup', authenticate, async (req, res) => {
    const { key } = z.object({ key: uuid }).parse(req.body);
    const auth = req as AuthRequest;
    const result = await transaction(async (db) => {
      const identity = await resolveOperator(db, auth, req.get('X-Operation-Token'));
      if (auth.mode === 'terminal') {
        const owner = await one(
          db,
          'SELECT user_id FROM operations WHERE operation_key=$1 LIMIT 1',
          [key],
        );
        ensure(
          !owner || owner.user_id === identity.user.id,
          409,
          'OPERATION_OWNER_MISMATCH',
          'Esta operación pertenece a otro empleado. Identificá a su responsable antes de reintentar.',
        );
      }
      const previous = await one(
        db,
        'SELECT id,action,access_permission,result,table_id FROM operations WHERE user_id=$1 AND operation_key=$2',
        [identity.user.id, key],
      );
      if (previous) {
        if (auth.mode === 'terminal') {
          terminalCommandAllowed(previous.action as string);
          ensure(
            previous.table_id === identity.tableId,
            403,
            'PIN_REQUIRED',
            'Identificate en la mesa original de esta operación.',
            { table_id: previous.table_id },
          );
        }
        commandAccess(previous.action as string, identity.permissions);
        ensure(
          !previous.access_permission ||
            identity.permissions.includes(previous.access_permission as string),
          403,
          'FORBIDDEN',
          'Ya no tenés permiso para consultar este resultado.',
        );
      }
      return previous
        ? { found: true, result: previous.result, operation_id: previous.id }
        : { found: false };
    });
    res.json(result);
  });
  app.post(
    '/api/audit/query',
    authenticate,
    managementOnly,
    requirePermission('audit'),
    async (req, res) => {
      const input = z
        .object({
          user_id: uuid.optional(),
          from: z.iso.datetime({ offset: true }).optional(),
          to: z.iso.datetime({ offset: true }).optional(),
          entity: z.string().max(50).optional(),
          operation: z.string().max(80).optional(),
        })
        .parse(req.body);
      const events = await rows(
        pool,
        `SELECT a.*,u.name user_name,v.name authorizer_name FROM audit_events a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN users v ON v.id=a.authorized_by WHERE ($1::uuid IS NULL OR a.user_id=$1) AND ($2::timestamptz IS NULL OR a.created_at>=$2) AND ($3::timestamptz IS NULL OR a.created_at<=$3) AND ($4::text IS NULL OR a.entity=$4) AND ($5::text IS NULL OR a.operation=$5) ORDER BY a.created_at DESC LIMIT 1000`,
        [input.user_id, input.from, input.to, input.entity, input.operation],
      );
      res.json({ events });
    },
  );
  app.post('/api/files/download', async (req, res, next) => {
    const { id } = z.object({ id: uuid }).parse(req.body);
    const file = await one(pool, 'SELECT public FROM stored_files WHERE id=$1', [id]);
    ensure(file, 404, 'FILE_NOT_FOUND', 'No se encontró el archivo.');
    if (file.public) {
      deliverFile(res, await transaction((db) => fileContent(db, id)));
      return;
    }
    authenticate(req, res, (error?: unknown) => {
      if (error) return next(error);
      const auth = req as AuthRequest;
      if (auth.mode === 'terminal')
        return next(
          new ApiError(
            403,
            'MANAGEMENT_REQUIRED',
            'Los archivos internos se descargan desde Gestión.',
          ),
        );
      transaction((db) => fileContent(db, id, auth.user.id, auth.permissions))
        .then((value) => deliverFile(res, value))
        .catch(next);
    });
  });
  app.post('/api/products/image', async (req, res) => {
    const input = z
      .object({
        name: z
          .string()
          .max(100)
          .regex(/\.(png|jpe?g|webp)$/i),
        content_base64: z
          .string()
          .max(4_200_000)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      })
      .parse(req.body);
    const buffer = Buffer.from(input.content_base64, 'base64');
    ensure(
      buffer.length > 0 && buffer.length <= 3 * 1024 * 1024,
      422,
      'IMAGE_SIZE',
      'La imagen debe pesar hasta 3 MB.',
    );
    const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    const webp =
      buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    ensure(
      png || jpeg || webp,
      422,
      'IMAGE_CONTENT',
      'El contenido no corresponde a PNG, JPEG o WebP.',
    );
    let image: Buffer;
    try {
      const pipeline = sharp(buffer, { limitInputPixels: 16_000_000, animated: false });
      const metadata = await pipeline.metadata();
      ensure(
        ['png', 'jpeg', 'webp'].includes(metadata.format ?? ''),
        422,
        'IMAGE_CONTENT',
        'Formato de imagen no admitido.',
      );
      image = await pipeline
        .rotate()
        .resize(1440, 1440, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new ApiError(
        422,
        'IMAGE_CONTENT',
        'No se pudo decodificar la imagen; verificá su contenido y dimensiones.',
      );
    }
    const name = `${randomUUID()}.webp`;
    await writeAsset(pool, `uploads/${name}`, image);
    await auditEvent(
      pool,
      (req as AuthRequest).user.id,
      'product.image',
      'product',
      undefined,
      undefined,
      { image_url: `/uploads/${name}`, bytes: image.length },
    );
    res.json({ image_url: `/uploads/${name}` });
  });
  app.post(
    '/api/demo/mailbox',
    authenticate,
    managementOnly,
    requirePermission('manage_users'),
    async (_req, res) => {
      ensure(
        config.demo,
        403,
        'DEMO_DISABLED',
        'La bandeja local solo está disponible en demostración.',
      );
      res.json({
        messages: await rows(
          pool,
          'SELECT m.id,u.username,m.token,m.expires_at,m.created_at FROM demo_mailbox m JOIN users u ON u.id=m.user_id WHERE m.expires_at>now() ORDER BY m.created_at DESC',
        ),
        disclaimer: 'Bandeja local de pruebas. No se envió correo externo.',
      });
    },
  );
  app.post(
    '/api/demo/reset',
    authenticate,
    csrf,
    managementOnly,
    requirePermission('settings'),
    async (req, res) => {
      ensure(
        mayResetDemo(config.DATABASE_URL, config.demo, config.NODE_ENV),
        403,
        'RESET_DISABLED',
        'La restauración está limitada a una base de demostración identificada.',
      );
      z.object({ confirmation: z.literal('RESTAURAR DEMO') }).parse(req.body);
      await transaction(async (db) => {
        await db.query(
          'TRUNCATE audit_events,operations,file_deliveries,stored_files,invoice_events,invoices,print_events,print_jobs,product_returns,refunds,payment_allocations,payments,payment_plans,cash_movements,cash_sessions,discounts,order_send_items,order_sends,item_addons,items,accounts,dining_tables,table_groups,product_addons,products,addons,categories,demo_mailbox,password_resets,sessions,auth_attempts,users RESTART IDENTITY CASCADE',
        );
        await seed(db);
      });
      res
        .clearCookie('baguette_session')
        .clearCookie('baguette_terminal')
        .json({ ok: true, message: 'Datos ficticios restaurados. Iniciá sesión otra vez.' });
    },
  );
  app.use('/api', (_req, _res, next) =>
    next(
      new ApiError(
        404,
        'API_NOT_FOUND',
        'La ruta de API no existe o el método no está permitido. Las consultas usan POST.',
      ),
    ),
  );
  app.get('/uploads/:name', async (req, res, next) => {
    if (!/^[0-9a-f-]{36}\.webp$/.test(req.params.name)) return res.sendStatus(404);
    try {
      const content = await readAsset(pool, `uploads/${req.params.name}`);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.type('webp').send(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return res.sendStatus(404);
      next(error);
    }
  });
  app.use(
    '/uploads',
    express.static(path.join(config.storage, 'uploads'), {
      dotfiles: 'deny',
      fallthrough: false,
      maxAge: '1d',
      setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );
  const frontend = path.resolve('frontend/dist');
  if (existsSync(frontend)) {
    app.use(express.static(frontend));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(frontend, 'index.html')));
  }
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof z.ZodError) {
      res.status(422).json({
        error: {
          code: 'VALIDATION',
          message: 'Revisá los campos indicados.',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }
    if (error instanceof ApiError) {
      res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
      return;
    }
    const pg =
      error && typeof error === 'object'
        ? (error as { code?: string; type?: string; status?: number })
        : {};
    if (pg.code === '23505') {
      res.status(409).json({
        error: {
          code: 'UNIQUE_CONFLICT',
          message: 'Ya existe un registro con ese identificador o la operación ya fue aplicada.',
        },
      });
      return;
    }
    if (['23503', '23514', '22P02'].includes(pg.code ?? '')) {
      res.status(422).json({
        error: {
          code: 'INTEGRITY',
          message: 'La operación viola una relación o regla de integridad.',
        },
      });
      return;
    }
    if (pg.type === 'entity.too.large') {
      res.status(413).json({
        error: {
          code: 'BODY_SIZE',
          message: 'El archivo o solicitud supera el tamaño admitido.',
        },
      });
      return;
    }
    if (pg.type === 'entity.parse.failed') {
      res
        .status(400)
        .json({ error: { code: 'INVALID_JSON', message: 'La solicitud JSON no es válida.' } });
      return;
    }
    if (pg.type === 'charset.unsupported' || pg.type === 'encoding.unsupported') {
      res.status(415).json({
        error: {
          code: 'BODY_ENCODING',
          message: 'La codificación de la solicitud no está admitida. Usá JSON en UTF-8.',
        },
      });
      return;
    }
    process.stderr.write(
      `Error interno de API (${typeof pg.code === 'string' ? pg.code : 'sin código'}).\n`,
    );
    res.status(500).json({
      error: {
        code: 'INTERNAL',
        message: 'No se pudo completar la operación. Consultá su resultado antes de reintentar.',
      },
    });
  };
  app.use(errorHandler);
  return app;
}
