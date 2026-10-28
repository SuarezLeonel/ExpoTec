import { z } from 'zod';
import { one, rows, type DB } from '../database/db.js';
import { config } from '../config/env.js';
import { hashPassword, operationHash, sha256, verifyPassword } from './security.js';
import { ensure } from './errors.js';
import type { AuthRequest, User } from './types.js';
import { pinVerifierCache } from './pin-verifier-cache.js';

export const pinValue = z.string().regex(/^[0-9]{4}$/, 'Ingresá exactamente cuatro dígitos.');
const protectedPin = (pin: string) =>
  operationHash(`operational-pin:v1:${pin}`, config.OPERATION_HASH_KEY);
export const pinLookup = (pin: string) =>
  operationHash(`operational-pin-lookup:v1:${pinValue.parse(pin)}`, config.OPERATION_HASH_KEY);
export const hashPin = (pin: string) => hashPassword(protectedPin(pinValue.parse(pin)));
const verifyCachedPin = pinVerifierCache(verifyPassword);
export const verifyPin = (pin: string, hash: string) =>
  verifyCachedPin(protectedPin(pinValue.parse(pin)), hash);
export const operationalPermissions = (permissions: string[]) =>
  permissions.filter((permission) =>
    ['operate', 'cash', 'discount', 'refund', 'sensitive_void'].includes(permission),
  );
export interface OperatorIdentity {
  user: User;
  permissions: string[];
  tableId?: string;
}
export async function resolveOperator(
  db: DB,
  auth: AuthRequest,
  grant?: string,
): Promise<OperatorIdentity> {
  if (auth.mode !== 'terminal') {
    const user = await one(
      db,
      "SELECT u.id,u.username,u.name,u.role,u.active FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=$1 AND u.active AND s.id=$2 AND s.mode='management' AND s.revoked_at IS NULL AND s.expires_at>now()",
      [auth.user.id, auth.sessionId],
    );
    ensure(user, 401, 'UNAUTHENTICATED', 'La sesión fue revocada. Iniciá sesión nuevamente.');
    const permissions = (
      await rows(db, 'SELECT permission FROM role_permissions WHERE role=$1', [user.role])
    ).map((row) => row.permission as string);
    return {
      user: {
        id: user.id as string,
        username: user.username as string,
        name: user.name as string,
        role: user.role as string,
        active: true,
      },
      permissions,
    };
  }
  ensure(
    grant && /^[a-f0-9]{64}$/.test(grant),
    403,
    'PIN_REQUIRED',
    'Ingresá el PIN del empleado para operar en esta mesa.',
  );
  const identity = await one(
    db,
    `SELECT u.id,u.username,u.name,u.role,u.active,g.table_id FROM operational_grants g JOIN users u ON u.id=g.user_id JOIN sessions s ON s.id=g.session_id JOIN users terminal ON terminal.id=s.user_id WHERE g.token_hash=$1 AND g.session_id=$2 AND g.expires_at>now() AND g.pin_version=u.pin_version AND u.active AND u.role<>'terminal' AND s.mode='terminal' AND s.revoked_at IS NULL AND s.expires_at>now() AND terminal.active`,
    [sha256(grant), auth.sessionId],
  );
  ensure(
    identity,
    403,
    'PIN_REQUIRED',
    'La identificación del empleado venció o cambió. Volvé a ingresar el PIN.',
  );
  const permissions = (
    await rows(db, 'SELECT permission FROM role_permissions WHERE role=$1', [identity.role])
  ).map((row) => row.permission as string);
  return {
    user: {
      id: identity.id as string,
      username: identity.username as string,
      name: identity.name as string,
      role: identity.role as string,
      active: true,
    },
    permissions: operationalPermissions(permissions),
    tableId: identity.table_id as string,
  };
}
const allowedTerminalCommands = new Set([
  'account.open',
  'account.update',
  'account.move',
  'account.request',
  'account.close',
  'account.split',
  'account.merge',
  'item.add',
  'item.edit',
  'item.transfer',
  'item.void',
  'order.send',
  'order.submit',
  'discount.apply',
  'payment.add',
  'refund.add',
]);
export function terminalCommandAllowed(action: string) {
  ensure(
    allowedTerminalCommands.has(action),
    403,
    'MANAGEMENT_REQUIRED',
    'Esta acción se realiza en Gestión con una sesión independiente.',
  );
}
export async function checkOperationTable(
  db: DB,
  identity: OperatorIdentity,
  action: string,
  body: unknown,
) {
  const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const accountId = z.uuid().safeParse(data.account_id);
  const directTable = z.uuid().safeParse(data.table_id);
  const target =
    (action === 'account.open' || (action === 'order.submit' && !data.account_id)) &&
    directTable.success
      ? { table_id: directTable.data }
      : accountId.success
        ? await one(db, 'SELECT table_id FROM accounts WHERE id=$1', [accountId.data])
        : undefined;
  ensure(
    target,
    422,
    'OPERATION_TABLE_REQUIRED',
    'La operación debe indicar una mesa o cuenta válida.',
  );
  ensure(
    target.table_id === identity.tableId,
    403,
    'PIN_REQUIRED',
    'Volvé a ingresar el PIN al entrar a esta mesa.',
    { table_id: target.table_id },
  );
  for (const field of ['target_account_id', 'source_account_id']) {
    const related = z.uuid().safeParse(data[field]);
    if (!related.success) continue;
    const account = await one(db, 'SELECT table_id FROM accounts WHERE id=$1', [related.data]);
    ensure(
      account && account.table_id === identity.tableId,
      403,
      'MANAGEMENT_REQUIRED',
      'Para trasladar consumos entre mesas diferentes usá Gestión.',
    );
  }
  return target.table_id as string;
}
/** Individual sessions retain their PIN gate; the shared terminal resolves the employee first. */
export async function requireOperationalPin(
  db: DB,
  auth: AuthRequest,
  action: string,
  body: unknown,
  grant?: string,
) {
  if (
    auth.mode === 'terminal' ||
    !['account.open', 'item.add', 'item.edit', 'order.send', 'order.submit'].includes(action)
  )
    return;
  const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const direct = action === 'account.open' || (action === 'order.submit' && !data.account_id);
  const id = z.uuid().safeParse(direct ? data.table_id : data.account_id);
  if (!id.success) return;
  const target = direct
    ? await one(db, 'SELECT id table_id FROM dining_tables WHERE id=$1', [id.data])
    : await one(db, 'SELECT table_id FROM accounts WHERE id=$1', [id.data]);
  if (!target) return;
  const valid =
    grant &&
    /^[a-f0-9]{64}$/.test(grant) &&
    (await one(
      db,
      'SELECT g.id FROM operational_grants g JOIN users u ON u.id=g.user_id WHERE g.token_hash=$1 AND g.user_id=$2 AND g.session_id=$3 AND g.table_id=$4 AND g.expires_at>now() AND g.pin_version=u.pin_version AND u.active',
      [sha256(grant), auth.user.id, auth.sessionId, target.table_id],
    ));
  ensure(valid, 403, 'PIN_REQUIRED', 'Validá tu PIN para comandar en esta mesa.', {
    table_id: target.table_id,
  });
}
