import { Router } from 'express';
import { z } from 'zod';
import { pool, one, transaction } from '../database/db.js';
import { config } from '../config/env.js';
import { authenticate, csrf } from '../middleware/auth.js';
import { ensure } from './errors.js';
import { hashPassword, sha256, token, verifyPassword } from './security.js';
import { operationalPermissions, pinLookup, pinValue, verifyPin } from './operational-pin.js';
import { uuid, password, username } from './validation.js';
import { auditEvent } from './audit.js';
import type { AuthRequest } from './types.js';
import { tableState } from './queries.js';

export const authRouter = Router();
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: config.NODE_ENV === 'production',
  path: '/',
  maxAge: 8 * 60 * 60 * 1000,
};
let dummyHash: Promise<string> | undefined;
export async function throttle(ip: string, route: string, limit: number) {
  const bucket = sha256(`${ip}:${route}`);
  const row = await one(
    pool,
    `INSERT INTO auth_attempts(bucket,attempts) VALUES($1,1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN auth_attempts.started_at<now()-interval '15 minutes' THEN 1 ELSE auth_attempts.attempts+1 END, started_at=CASE WHEN auth_attempts.started_at<now()-interval '15 minutes' THEN now() ELSE auth_attempts.started_at END RETURNING attempts`,
    [bucket],
  );
  ensure(
    row && (row.attempts as number) <= limit,
    429,
    'RATE_LIMIT',
    'Demasiados intentos. Esperá 15 minutos antes de volver a intentar.',
  );
}
async function removeSuccessfulPinAttempt(address: string, route: string) {
  // Lock the counter so concurrent successful PINs cannot erase failed guesses.
  await pool.query(
    `WITH counter AS MATERIALIZED (
      SELECT bucket,attempts FROM auth_attempts WHERE bucket=$1 FOR UPDATE
    ), cleared AS (
      DELETE FROM auth_attempts a USING counter c WHERE a.bucket=c.bucket AND c.attempts=1
    )
    UPDATE auth_attempts a SET attempts=c.attempts-1 FROM counter c WHERE a.bucket=c.bucket AND c.attempts>1`,
    [sha256(`${address}:${route}`)],
  );
}
authRouter.post('/login', async (req, res) => {
  await throttle(req.ip ?? 'local', 'login', 20);
  const input = z.object({ username, password: z.string().min(1).max(128) }).parse(req.body);
  const user = await one(
    pool,
    'SELECT id,username,name,role,password_hash,active FROM users WHERE username=$1',
    [input.username],
  );
  const valid = await verifyPassword(
    input.password,
    (user?.password_hash as string | undefined) ?? (await (dummyHash ??= hashPassword(token()))),
  );
  if (!user?.active || !valid || user.role === 'terminal') {
    await auditEvent(pool, undefined, 'auth.login.denied', 'session');
    ensure(false, 401, 'LOGIN_FAILED', 'No se pudo iniciar sesión con esos datos.');
  }
  const sessionToken = token();
  const csrfToken = token();
  const sessionUser = await transaction(async (db) => {
    // Password resets and user changes may commit while scrypt is running.
    const current = await one(
      db,
      "SELECT id,username,name,role FROM users WHERE id=$1 AND username=$2 AND password_hash=$3 AND active AND role<>'terminal' FOR UPDATE",
      [user.id, input.username, user.password_hash],
    );
    if (!current) {
      await auditEvent(db, undefined, 'auth.login.denied', 'session');
      return undefined;
    }
    await db.query(
      "INSERT INTO sessions(user_id,token_hash,csrf,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",
      [current.id, sha256(sessionToken), csrfToken],
    );
    await auditEvent(db, current.id as string, 'auth.login', 'session');
    return current;
  });
  ensure(sessionUser, 401, 'LOGIN_FAILED', 'No se pudo iniciar sesión con esos datos.');
  res.cookie('baguette_session', sessionToken, cookieOptions).json({
    user: sessionUser,
    csrf: csrfToken,
    mode: 'management',
  });
});
authRouter.post('/session', authenticate, (req, res) => {
  const auth = req as AuthRequest;
  res.json({ user: auth.user, csrf: auth.csrf, permissions: auth.permissions, mode: auth.mode });
});
authRouter.post('/logout', authenticate, csrf, async (req, res) => {
  const auth = req as AuthRequest;
  await transaction(async (db) => {
    await db.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [auth.sessionId]);
    await db.query('DELETE FROM operational_grants WHERE session_id=$1', [auth.sessionId]);
    await auditEvent(db, auth.user.id, 'auth.logout', 'session');
  });
  res
    .clearCookie(auth.mode === 'terminal' ? 'baguette_terminal' : 'baguette_session', cookieOptions)
    .json({ ok: true });
});
authRouter.post('/recover', async (req, res) => {
  await throttle(req.ip ?? 'local', 'recover', 8);
  const input = z.object({ username }).parse(req.body);
  const user = await one(pool, 'SELECT id FROM users WHERE username=$1 AND active', [
    input.username,
  ]);
  if (user && config.demo) {
    const reset = token();
    await transaction(async (db) => {
      await db.query(
        'UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',
        [user.id],
      );
      await db.query('DELETE FROM demo_mailbox WHERE user_id=$1', [user.id]);
      await db.query(
        "INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '20 minutes')",
        [user.id, sha256(reset)],
      );
      await db.query(
        "INSERT INTO demo_mailbox(user_id,token,expires_at) VALUES($1,$2,now()+interval '20 minutes')",
        [user.id, reset],
      );
      await auditEvent(db, user.id as string, 'auth.recover.local', 'user', user.id as string);
    });
  }
  res.json({
    message:
      'Si el usuario está habilitado, la recuperación queda disponible en la bandeja local de demostración. No se envió correo externo.',
  });
});
authRouter.post('/reset', async (req, res) => {
  await throttle(req.ip ?? 'local', 'reset', 12);
  const input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password }).parse(req.body);
  const hashed = await hashPassword(input.password);
  await transaction(async (db) => {
    const reset = await one(
      db,
      'SELECT r.id,r.user_id FROM password_resets r JOIN users u ON u.id=r.user_id WHERE r.token_hash=$1 AND r.used_at IS NULL AND r.expires_at>now() AND u.active FOR UPDATE OF r',
      [sha256(input.token)],
    );
    ensure(reset, 422, 'RESET_INVALID', 'El enlace de recuperación no es válido o venció.');
    await db.query('UPDATE password_resets SET used_at=now() WHERE id=$1', [reset.id]);
    await db.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2', [
      hashed,
      reset.user_id,
    ]);
    await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [
      reset.user_id,
    ]);
    await db.query('DELETE FROM operational_grants WHERE user_id=$1', [reset.user_id]);
    await db.query('DELETE FROM demo_mailbox WHERE user_id=$1', [reset.user_id]);
    await auditEvent(db, reset.user_id as string, 'auth.reset', 'user', reset.user_id as string);
  });
  res.json({
    ok: true,
    message: 'Contraseña actualizada. Las sesiones anteriores fueron revocadas.',
  });
});

authRouter.post('/operational-pin', authenticate, csrf, async (req, res) => {
  const auth = req as AuthRequest;
  if (auth.mode === 'terminal') {
    const input = z.object({ table_id: uuid, pin: pinValue }).strict().parse(req.body);
    const address = req.ip ?? 'local';
    await throttle(address, 'terminal-pin', 8);
    const identified = await one(
      pool,
      "SELECT id,username,name,role,pin_hash,pin_version FROM users WHERE active AND pin_lookup=$1 AND role<>'terminal'",
      [pinLookup(input.pin)],
    );
    const valid =
      identified?.pin_hash && (await verifyPin(input.pin, identified.pin_hash as string));
    if (!valid) {
      await auditEvent(pool, undefined, 'auth.pin.denied', 'table', input.table_id);
      ensure(
        false,
        403,
        'PIN_INVALID',
        'El PIN no identifica un empleado habilitado. Verificá los cuatro dígitos o pedile al encargado que lo configure.',
      );
    }
    const grant = token();
    const identity = await transaction(async (db) => {
      const employee = await one(
        db,
        `SELECT u.id,u.username,u.name,u.role,u.pin_version,
          EXISTS(SELECT 1 FROM sessions WHERE id=$4 AND mode='terminal' AND revoked_at IS NULL AND expires_at>now()) session_active,
          EXISTS(SELECT 1 FROM dining_tables WHERE id=$5 AND active) table_active,
          ARRAY(SELECT permission FROM role_permissions WHERE role=u.role) permissions
         FROM users u WHERE u.id=$1 AND u.active AND u.pin_lookup=$2 AND u.pin_version=$3`,
        [
          identified.id,
          pinLookup(input.pin),
          identified.pin_version,
          auth.sessionId,
          input.table_id,
        ],
      );
      ensure(
        employee && employee.session_active,
        403,
        'PIN_REQUIRED',
        'La sesión o las credenciales cambiaron. Volvé a ingresar el PIN.',
      );
      const permissions = operationalPermissions(employee.permissions as string[]);
      ensure(
        permissions.includes('operate'),
        403,
        'FORBIDDEN',
        'El empleado identificado no tiene permiso para operar mesas.',
      );
      ensure(employee.table_active, 404, 'NOT_FOUND', 'La mesa no está disponible.');
      await db.query(
        `WITH released AS (
          DELETE FROM operational_grants WHERE session_id=$1 OR expires_at<=now() RETURNING id
        ), granted AS (
          INSERT INTO operational_grants(session_id,user_id,table_id,token_hash,pin_version,expires_at)
          SELECT $1,$2,$3,$4,$5,now()+interval '10 minutes' WHERE (SELECT count(*) FROM released)>=0 RETURNING id
        ), counter AS MATERIALIZED (
          SELECT bucket,attempts FROM auth_attempts WHERE bucket=$6 FOR UPDATE
        ), cleared AS (
          DELETE FROM auth_attempts a USING counter c WHERE a.bucket=c.bucket AND c.attempts=1
        ), decremented AS (
          UPDATE auth_attempts a SET attempts=c.attempts-1 FROM counter c WHERE a.bucket=c.bucket AND c.attempts>1
        )
        INSERT INTO audit_events(user_id,operation,entity,entity_id)
        SELECT $2,'auth.pin.verified','table',$3 FROM granted`,
        [
          auth.sessionId,
          employee.id,
          input.table_id,
          sha256(grant),
          employee.pin_version,
          sha256(`${address}:terminal-pin`),
        ],
      );
      return {
        operator: {
          id: employee.id,
          username: employee.username,
          name: employee.name,
          role: employee.role,
        },
        permissions,
        table_state: await tableState(db, input.table_id, permissions.includes('cash')),
      };
    });
    res.json({ token: grant, expires_in: 600, ...identity });
    return;
  }
  ensure(auth.permissions.includes('operate'), 403, 'FORBIDDEN', 'Tu usuario no puede comandar.');
  const input = z.object({ table_id: uuid, pin: pinValue }).parse(req.body);
  const address = `${req.ip ?? 'local'}:${auth.user.id}`;
  await throttle(address, 'operational-pin', 8);
  const user = await one(pool, 'SELECT pin_hash,pin_version FROM users WHERE id=$1 AND active', [
    auth.user.id,
  ]);
  ensure(
    user?.pin_hash,
    422,
    'PIN_NOT_CONFIGURED',
    'Pedile al encargado que configure tu PIN de comanda.',
  );
  const valid = await verifyPin(input.pin, user.pin_hash as string);
  if (!valid) {
    await auditEvent(pool, auth.user.id, 'auth.pin.denied', 'table', input.table_id);
    ensure(false, 403, 'PIN_INVALID', 'El PIN no corresponde a tu usuario.');
  }
  const grant = token();
  await transaction(async (db) => {
    const current = await one(
      db,
      'SELECT u.pin_version FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=$1 AND u.active AND s.id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()',
      [auth.user.id, auth.sessionId],
    );
    ensure(
      current && current.pin_version === user.pin_version,
      401,
      'UNAUTHENTICATED',
      'La sesión o el PIN cambiaron. Iniciá sesión nuevamente.',
    );
    ensure(
      await one(db, 'SELECT id FROM dining_tables WHERE id=$1 AND active', [input.table_id]),
      404,
      'NOT_FOUND',
      'La mesa no está disponible.',
    );
    await db.query(
      'DELETE FROM operational_grants WHERE expires_at<=now() OR (session_id=$1 AND table_id=$2)',
      [auth.sessionId, input.table_id],
    );
    await db.query(
      "INSERT INTO operational_grants(session_id,user_id,table_id,token_hash,pin_version,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')",
      [auth.sessionId, auth.user.id, input.table_id, sha256(grant), user.pin_version],
    );
    await auditEvent(db, auth.user.id, 'auth.pin.verified', 'table', input.table_id);
  });
  await removeSuccessfulPinAttempt(address, 'operational-pin');
  res.json({ token: grant, expires_in: 600, operator: auth.user, permissions: auth.permissions });
});

authRouter.post('/terminal', async (req, res) => {
  ensure(
    config.demo,
    403,
    'DEMO_DISABLED',
    'La terminal compartida automática está disponible solo en demostración.',
  );
  const cookie: unknown = req.cookies?.baguette_terminal;
  if (typeof cookie === 'string' && /^[a-f0-9]{64}$/.test(cookie)) {
    const existing = await one(
      pool,
      "SELECT s.csrf,u.id,u.username,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.mode='terminal' AND s.revoked_at IS NULL AND s.expires_at>now() AND u.active AND u.role='terminal'",
      [sha256(cookie)],
    );
    if (existing) {
      res.json({
        user: {
          id: existing.id,
          username: existing.username,
          name: existing.name,
          role: existing.role,
        },
        csrf: existing.csrf,
        mode: 'terminal',
        permissions: ['terminal_view'],
      });
      return;
    }
  }
  await throttle(req.ip ?? 'local', 'terminal-bootstrap', 30);
  const technicalId = '50000000-0000-4000-8000-000000000007';
  const exists = await one(pool, 'SELECT id FROM users WHERE id=$1', [technicalId]);
  const passwordHash = exists ? undefined : await hashPassword(token());
  const sessionToken = token();
  const csrfToken = token();
  const user = await transaction(async (db) => {
    if (!exists)
      await db.query(
        "INSERT INTO users(id,username,name,role,password_hash) VALUES($1,'terminal.demo','Terminal compartida','terminal',$2) ON CONFLICT(id) DO NOTHING",
        [technicalId, passwordHash],
      );
    const technical = await one(
      db,
      "SELECT id,username,name,role FROM users WHERE id=$1 AND active AND role='terminal'",
      [technicalId],
    );
    ensure(
      technical,
      403,
      'TERMINAL_DISABLED',
      'La terminal está deshabilitada. Contactá al encargado.',
    );
    await db.query(
      "INSERT INTO sessions(user_id,token_hash,csrf,mode,expires_at) VALUES($1,$2,$3,'terminal',now()+interval '8 hours')",
      [technicalId, sha256(sessionToken), csrfToken],
    );
    await auditEvent(db, undefined, 'auth.terminal.open', 'session');
    return technical;
  });
  res
    .cookie('baguette_terminal', sessionToken, cookieOptions)
    .json({ user, csrf: csrfToken, mode: 'terminal', permissions: ['terminal_view'] });
});
authRouter.post('/operator-release', authenticate, csrf, async (req, res) => {
  const auth = req as AuthRequest;
  ensure(
    auth.mode === 'terminal',
    403,
    'MANAGEMENT_REQUIRED',
    'La liberación de operador corresponde a una terminal compartida.',
  );
  const grant = req.get('X-Operation-Token');
  await transaction(async (db) => {
    await db.query(
      'DELETE FROM operational_grants WHERE session_id=$1 AND ($2::text IS NULL OR token_hash=$2)',
      [auth.sessionId, grant ? sha256(grant) : null],
    );
    await auditEvent(db, undefined, 'auth.operator.release', 'session');
  });
  res.json({ ok: true });
});
