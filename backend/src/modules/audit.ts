import type { DB } from '../database/db.js';
import type { CommandContext } from './types.js';

export async function audit(
  ctx: CommandContext,
  operation: string,
  entity: string,
  entityId?: string,
  before?: unknown,
  after?: unknown,
  reason?: string,
  authorizer?: string,
) {
  return auditEvent(
    ctx.db,
    ctx.user.id,
    operation,
    entity,
    entityId,
    before,
    after,
    reason,
    authorizer,
    ctx.operationId,
  );
}
export async function auditEvent(
  db: DB,
  userId: string | undefined,
  operation: string,
  entity: string,
  entityId?: string,
  before?: unknown,
  after?: unknown,
  reason?: string,
  authorizer?: string,
  operationId?: string,
) {
  await db.query(
    'INSERT INTO audit_events(user_id,authorized_by,operation_id,operation,entity,entity_id,before_value,after_value,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      userId ?? null,
      authorizer ?? null,
      operationId ?? null,
      operation,
      entity,
      entityId ?? null,
      before === undefined ? null : JSON.stringify(before),
      after === undefined ? null : JSON.stringify(after),
      reason ?? null,
    ],
  );
}
