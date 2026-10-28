import type { Account, Item, Pending } from '../types';
import { ApiError } from './api';

export function pendingForTable(pending: Pending[], tableId: string): Pending[] {
  if (!tableId) return [];
  return pending.filter((entry) => (entry.table_id || entry.body.table_id) === tableId);
}

export function confirmedOrder(
  result: unknown,
  entry: Pending,
): { account: Account; items: Item[] } {
  const value = result as { account?: Account; items?: Item[] } | null;
  const expected = [
    ...((entry.body.item_ids || []) as string[]),
    ...((entry.body.items || []) as { client_id?: string }[])
      .map((line) => line.client_id)
      .filter(Boolean),
  ];
  const expectedIds = new Set(expected);
  if (
    !value?.account ||
    typeof value.account.id !== 'string' ||
    value.account.table_id !== entry.table_id ||
    !Number.isSafeInteger(value.account.version) ||
    value.account.version < 1 ||
    !Array.isArray(value.items) ||
    expectedIds.size === 0 ||
    expectedIds.size !== expected.length ||
    value.items.length !== expectedIds.size ||
    new Set(value.items.map((item) => item?.id)).size !== expectedIds.size ||
    !value.items.every(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        expectedIds.has(item.id) &&
        item.account_id === value.account!.id &&
        item.status === 'sent',
    ) ||
    !expected.every((id) => value.items!.some((item) => item.id === id))
  ) {
    throw new ApiError(
      502,
      'INVALID_RESPONSE',
      'No se recibió una confirmación completa del pedido. Consultá su resultado en Pendientes.',
    );
  }
  return value as { account: Account; items: Item[] };
}

export function settlePending(pending: Pending[], confirmed: Pending, result: unknown): Pending[] {
  const remaining = pending.filter((entry) => entry.key !== confirmed.key);
  if (confirmed.action !== 'item.add' || !result || typeof result !== 'object') return remaining;
  const account = 'account' in result ? result.account : undefined;
  if (!account || typeof account !== 'object') return remaining;
  const version = 'version' in account ? account.version : undefined;
  const accountId = 'id' in account ? account.id : undefined;
  if (
    accountId !== confirmed.body.account_id ||
    typeof confirmed.body.version !== 'number' ||
    version !== confirmed.body.version + 1
  )
    return remaining;
  return remaining.map((entry) =>
    entry.action === 'item.add' &&
    entry.state === 'pending' &&
    entry.actor_id === confirmed.actor_id &&
    entry.body.account_id === accountId &&
    entry.body.version === confirmed.body.version &&
    entry.created_at >= confirmed.created_at
      ? { ...entry, body: { ...entry.body, version } }
      : entry,
  );
}
