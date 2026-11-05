/**
 * Middlewares y utilidades de autenticación, autorización y seguridad de sesión.
 *
 * El sistema opera con dos modos de sesión estrictamente aislados:
 * 1. Modo Gestión (`management`): Sesión de usuario individual (admin, cajero, mozo) con cookie `baguette_session`.
 * 2. Modo Terminal (`terminal`): Sesión compartida de terminal del salón con cookie `baguette_terminal`,
 *    cuyas operaciones requieren validación de PIN operativo por mesa.
 */

import type { RequestHandler } from 'express';
import { pool, one, type DB } from '../database/db.js';
import { sha256, verifyPassword } from '../modules/security.js';
import { ApiError, ensure } from '../modules/errors.js';
import type { AuthRequest, CommandContext, User } from '../modules/types.js';

/**
 * Middleware que verifica la validez de la sesión HTTP mediante cookie firmada y consulta a base de datos.
 * Adjunta al objeto `req` la identidad del usuario, modo de acceso, token CSRF y lista de permisos.
 */
export const authenticate: RequestHandler = async (request, _response, next) => {
  try {
    const mode = request.get('X-Session-Mode') === 'terminal' ? 'terminal' : 'management';
    const cookie: unknown =
      mode === 'terminal' ? request.cookies?.baguette_terminal : request.cookies?.baguette_session;
    ensure(
      typeof cookie === 'string' && /^[a-f0-9]{64}$/.test(cookie),
      401,
      'UNAUTHENTICATED',
      'Iniciá sesión para continuar.',
    );
    const session = await one(
      pool,
      "SELECT s.id session_id,s.csrf,u.id,u.username,u.name,u.role,u.active,coalesce((SELECT json_agg(permission) FROM role_permissions WHERE role=u.role),'[]'::json) permissions FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.mode=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active",
      [sha256(cookie), mode],
    );
    ensure(session, 401, 'UNAUTHENTICATED', 'La sesión venció. Iniciá sesión nuevamente.');
    const req = request as AuthRequest;
    ensure(
      (mode === 'terminal') === (session.role === 'terminal'),
      401,
      'UNAUTHENTICATED',
      'La sesión no corresponde a este modo de acceso.',
    );
    req.mode = mode;
    req.user = {
      id: session.id as string,
      username: session.username as string,
      name: session.name as string,
      role: session.role as string,
      active: true,
    };
    req.sessionId = session.session_id as string;
    req.csrf = session.csrf as string;
    req.permissions = session.permissions as string[];
    next();
  } catch (error) {
    next(error);
  }
};
/**
 * Restringe la operación únicamente a sesiones en modo Gestión, bloqueando terminales de salón.
 */
export const managementOnly: RequestHandler = (request, _response, next) => {
  if ((request as AuthRequest).mode !== 'management')
    return next(
      new ApiError(
        403,
        'MANAGEMENT_REQUIRED',
        'Esta acción se realiza en Gestión con una sesión independiente.',
      ),
    );
  next();
};

/**
 * Valida que el token del encabezado X-CSRF-Token coincida con el emitido para la sesión.
 */
export const csrf: RequestHandler = (request, _response, next) => {
  const req = request as AuthRequest;
  if (request.get('X-CSRF-Token') !== req.csrf)
    return next(
      new ApiError(403, 'CSRF', 'La protección de sesión no coincide. Recargá la aplicación.'),
    );
  next();
};

/**
 * Genera un middleware que restringe el endpoint a usuarios con un permiso específico.
 */
export function requirePermission(permission: string): RequestHandler {
  return (request, _response, next) => {
    if (!(request as AuthRequest).permissions.includes(permission))
      return next(new ApiError(403, 'FORBIDDEN', 'Tu usuario no tiene permiso para esta acción.'));
    next();
  };
}

/**
 * Comprueba que el contexto de ejecución posea el permiso requerido; lanza ApiError 403 en caso contrario.
 */
export function has(ctx: CommandContext, permission: string) {
  ensure(
    ctx.permissions.includes(permission),
    403,
    'FORBIDDEN',
    'Tu usuario no tiene permiso para esta acción.',
  );
}

/**
 * Valida permisos para operaciones sensibles. Si el operador no cuenta con el permiso directo,
 * exige la autorización secundaria mediante usuario y contraseña de un supervisor distinto.
 *
 * @returns ID del usuario que autorizó la operación.
 */
export async function authorize(
  ctx: CommandContext,
  permission: string,
  credentials?: { username: string; password: string },
): Promise<string> {
  if (!credentials && ctx.permissions.includes(permission)) return ctx.user.id;
  ensure(
    credentials,
    403,
    'AUTHORIZATION_REQUIRED',
    'Se necesita autorización de caja o encargado con usuario y contraseña.',
  );
  const user = await one(
    ctx.db,
    'SELECT id,password_hash FROM users WHERE username=$1 AND active',
    [credentials.username.toLowerCase()],
  );
  const valid = user && (await verifyPassword(credentials.password, user.password_hash as string));
  const allowed =
    user &&
    (await one(
      ctx.db,
      'SELECT 1 FROM users u JOIN role_permissions p ON p.role=u.role WHERE u.id=$1 AND p.permission=$2',
      [user.id, permission],
    ));
  ensure(
    valid && allowed && user?.id !== ctx.user.id,
    403,
    'AUTHORIZATION_DENIED',
    'No fue posible autorizar. Verificá las credenciales y permisos de otra persona.',
  );
  return user.id as string;
}
export async function userById(db: DB, id: string): Promise<User | undefined> {
  return one<User>(db, 'SELECT id,username,name,role,active FROM users WHERE id=$1 AND active', [
    id,
  ]);
}
