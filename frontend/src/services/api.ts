import type { Download, Pending } from '../types';
let csrf = '';
let operationToken = '';
export const isTerminalMode = () => location.pathname.startsWith('/terminal');
export function setOperationToken(value: string) {
  operationToken = value;
}
let branchTimezone = 'America/Argentina/Buenos_Aires';
export function setTimezone(value?: string) {
  if (value) {
    new Intl.DateTimeFormat('es-AR', { timeZone: value });
    branchTimezone = value;
  }
}
export function setCsrf(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
function invalidResponse(): never {
  throw new ApiError(
    502,
    'INVALID_RESPONSE',
    'El servidor no devolvió una confirmación válida. Consultá el resultado en Pendientes antes de repetir la operación.',
  );
}
export async function post<T>(
  path: string,
  body: unknown = {},
  key?: string,
  grant?: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
      : AbortSignal.timeout(20_000),
    headers: {
      'Content-Type': 'application/json',
      ...(isTerminalMode() ? { 'X-Session-Mode': 'terminal' } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
      ...(grant || operationToken ? { 'X-Operation-Token': grant || operationToken } : {}),
    },
    body: JSON.stringify(body),
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (response.ok) invalidResponse();
  }
  const error =
    data &&
    typeof data === 'object' &&
    'error' in data &&
    data.error &&
    typeof data.error === 'object'
      ? (data.error as Record<string, unknown>)
      : undefined;
  if (!response.ok)
    throw new ApiError(
      response.status,
      typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED',
      typeof error?.message === 'string' ? error.message : 'No pudimos completar la operación.',
      error?.details,
    );
  if (!data || typeof data !== 'object' || Array.isArray(data)) invalidResponse();
  if (path === 'operations/lookup' && (!('found' in data) || typeof data.found !== 'boolean'))
    invalidResponse();
  if (
    path.startsWith('commands/') ||
    (path === 'operations/lookup' && 'found' in data && data.found)
  ) {
    if (
      !Object.hasOwn(data, 'result') ||
      !('operation_id' in data) ||
      typeof data.operation_id !== 'string' ||
      !data.operation_id
    )
      invalidResponse();
  }
  return data as T;
}
let pendingScope = 'anonymous';
const queueKey = (scope = pendingScope) => `baguette.pending.v2.${scope}`;
export function setPendingScope(id: string, mode: 'terminal' | 'management' = 'management') {
  pendingScope = mode === 'terminal' ? `terminal.${id}` : id;
  window.dispatchEvent(new Event('baguette:pending'));
}
export function readPending(scope = pendingScope): Pending[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(queueKey(scope)) || '[]');
    return Array.isArray(stored) ? stored.filter(isPending) : [];
  } catch {
    return [];
  }
}
function isPending(value: unknown): value is Pending {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.key === 'string' &&
    entry.key.length > 0 &&
    typeof entry.action === 'string' &&
    entry.action.length > 0 &&
    !!entry.body &&
    typeof entry.body === 'object' &&
    !Array.isArray(entry.body) &&
    ['pending', 'uncertain', 'failed'].includes(String(entry.state)) &&
    typeof entry.created_at === 'string' &&
    Number.isFinite(Date.parse(entry.created_at)) &&
    (entry.actor_id === undefined || typeof entry.actor_id === 'string') &&
    (entry.table_id === undefined || typeof entry.table_id === 'string') &&
    (entry.error === undefined || typeof entry.error === 'string') &&
    (entry.replayable === undefined || typeof entry.replayable === 'boolean') &&
    (entry.preview === undefined ||
      (Array.isArray(entry.preview) &&
        entry.preview.every(
          (item) =>
            item &&
            typeof item === 'object' &&
            typeof item.id === 'string' &&
            typeof item.name === 'string' &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0,
        )))
  );
}
export function savePending(pending: Pending[], scope = pendingScope) {
  localStorage.setItem(queueKey(scope), JSON.stringify(pending));
  window.dispatchEvent(new Event('baguette:pending'));
}
export function downloadFile(file: Download) {
  const bytes = Uint8Array.from(atob(file.content_base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const money = (value: unknown) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(Number(value || 0) / 100);
export const date = (value: unknown, time = false) =>
  value
    ? new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
        timeZone: branchTimezone,
      }).format(new Date(String(value)))
    : '—';
export const cents = (value: string) => {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value))
    throw new Error(
      'Ingresá un importe positivo con hasta dos decimales, sin separadores de miles.',
    );
  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > 100000000)
    throw new Error('El importe máximo permitido es $1.000.000.');
  return result;
};
export const operationLabel: Record<string, string> = {
  'order.submit': 'Enviar pedido completo',
  'account.open': 'Abrir cuenta',
  'account.update': 'Actualizar cuenta',
  'account.request': 'Pedir cuenta',
  'account.close': 'Cerrar cuenta',
  'account.move': 'Cambiar mesa',
  'account.split': 'Dividir cuenta',
  'account.merge': 'Agrupar cuentas',
  'item.add': 'Agregar producto',
  'item.edit': 'Editar producto',
  'item.void': 'Anular producto',
  'item.transfer': 'Mover productos',
  'order.send': 'Enviar pedido',
  'payment.add': 'Cobro',
  'refund.add': 'Reintegro',
  'discount.apply': 'Descuento',
  'cash.open': 'Abrir caja',
  'cash.close': 'Cerrar caja',
  'cash.move': 'Movimiento de caja',
  'product.save': 'Guardar producto',
  'category.save': 'Guardar categoría',
  'addon.save': 'Guardar agregado',
  'user.save': 'Guardar usuario',
  'table.save': 'Guardar mesa',
};
export const statusLabel: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Pedido',
  preparing: 'Pedido',
  ready: 'Pedido',
  delivered: 'Pedido',
  void: 'Anulado',
  open: 'Abierta',
  requested: 'Cuenta solicitada',
  closed: 'Cerrada',
  pending: 'Pendiente',
  success: 'Confirmado en simulador',
  failed: 'Falló',
  offline: 'Desconectada',
  uncertain: 'Resultado incierto',
  rejected: 'Rechazado',
  prepared: 'Preparado',
  generated: 'Generado',
  confirmed: 'Confirmado en simulador',
  issued: 'Emitido en simulador',
  cash: 'Efectivo',
  debit: 'Débito',
  credit: 'Crédito',
  transfer: 'Transferencia',
  kitchen: 'Cocina',
  bar: 'Bar',
  none: 'Sin preparación',
  admin: 'Encargado',
  cashier: 'Caja',
  waiter: 'Camarero',
};
