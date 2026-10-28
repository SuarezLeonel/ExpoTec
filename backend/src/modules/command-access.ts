import { ensure } from './errors.js';

const permissions: Record<string, string[]> = {
  'category.save': ['manage_catalog'],
  'addon.save': ['manage_catalog'],
  'product.save': ['manage_catalog'],
  'user.save': ['manage_users'],
  'table.save': ['manage_tables'],
  'floor-plan.draft.save': ['manage_tables'],
  'floor-plan.publish': ['manage_tables'],
  'table.group': ['operate'],
  'account.open': ['operate'],
  'account.update': ['operate'],
  'account.move': ['operate'],
  'account.request': ['operate'],
  'account.split': ['operate'],
  'account.merge': ['operate'],
  'item.transfer': ['operate'],
  'item.add': ['operate'],
  'item.edit': ['operate'],
  'order.send': ['operate'],
  'order.submit': ['operate'],
  'item.void': ['sensitive_void'],
  'item.status': ['operate', 'prepare_kitchen', 'prepare_bar'],
  'discount.apply': ['discount'],
  'payment.add': ['cash'],
  'refund.add': ['refund'],
  'account.close': ['cash'],
  'cash.open': ['cash'],
  'cash.move': ['cash'],
  'cash.close': ['cash'],
  'print.process': ['operate', 'cash', 'prepare_kitchen', 'prepare_bar'],
  'print.retry': ['operate', 'cash', 'prepare_kitchen', 'prepare_bar'],
  'print.copy': ['operate', 'cash', 'prepare_kitchen', 'prepare_bar'],
  'invoice.prepare': ['cash'],
  'invoice.process': ['cash'],
  'invoice.retry': ['cash'],
  'invoice.resolve': ['cash'],
  'report.export': ['cash', 'audit'],
};
export function commandAccess(action: string, current: string[], body?: unknown) {
  const required = Object.hasOwn(permissions, action) ? permissions[action] : undefined;
  ensure(
    required?.some((permission) => current.includes(permission)),
    403,
    'FORBIDDEN',
    'Tu usuario no tiene permiso para esta acción.',
  );
  if (action === 'report.export') {
    const report = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    if (report.kind === 'audit' || report.mime)
      ensure(
        current.includes('audit'),
        403,
        'FORBIDDEN',
        'La exportación de auditoría requiere permiso de encargado.',
      );
  }
}
export function replayScope(
  action: string,
  permissions: string[],
  input: Record<string, unknown>,
  result: unknown,
): string | null {
  if (action === 'report.export') return input.kind === 'audit' ? 'audit' : 'cash';
  if (action === 'item.status') {
    if (input.status === 'delivered') return 'operate';
    const value = result as { item: { destination: string } };
    return value.item.destination === 'bar' ? 'prepare_bar' : 'prepare_kitchen';
  }
  if (action.startsWith('print.')) {
    if (permissions.includes('operate')) return 'operate';
    const value = result as { destination: string };
    return value.destination === 'bar' ? 'prepare_bar' : 'prepare_kitchen';
  }
  return null;
}
