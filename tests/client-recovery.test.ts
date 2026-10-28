import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';
import {
  ApiError,
  post,
  readPending,
  savePending,
  setPendingScope,
} from '../frontend/src/services/api.ts';
import {
  confirmedOrder,
  pendingForTable,
  settlePending,
} from '../frontend/src/services/pending.ts';
import type { Pending } from '../frontend/src/types/index.ts';

const originalGlobals = Object.fromEntries(
  ['location', 'window', 'localStorage'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
const storage = new Map<string, string>();
Object.defineProperties(globalThis, {
  location: { configurable: true, value: { pathname: '/gestion' } },
  window: { configurable: true, value: new EventTarget() },
  localStorage: {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  },
});
beforeEach(() => {
  mock.restoreAll();
  storage.clear();
  setPendingScope('operator');
});
after(() => {
  mock.restoreAll();
  for (const [key, descriptor] of Object.entries(originalGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const entry = (key: string, changes: Partial<Pending> = {}): Pending => ({
  key,
  action: 'item.add',
  actor_id: 'operator',
  body: { account_id: 'account', version: 7, product_id: 'coffee', quantity: 1 },
  state: 'pending',
  created_at: '2026-10-20T14:00:00.000Z',
  ...changes,
});

test('un error HTTP sin JSON conserva su estado y no se confunde con un corte de red', async () => {
  for (const status of [401, 413, 503]) {
    mock.method(globalThis, 'fetch', async () => new Response('<html>Error</html>', { status }));
    await assert.rejects(
      post('commands/item.add'),
      (error: unknown) =>
        error instanceof ApiError && error.status === status && error.code === 'REQUEST_FAILED',
    );
    mock.restoreAll();
  }
});

test('una respuesta exitosa ilegible o vacía sigue siendo incierta y requiere consulta', async () => {
  for (const body of ['<html>Error</html>', 'null', 'false', '', '{}', '[]', '{"result":{}}']) {
    mock.method(globalThis, 'fetch', async () => new Response(body));
    await assert.rejects(
      post('commands/payment.add'),
      (error: unknown) =>
        error instanceof ApiError && error.status >= 500 && error.code === 'INVALID_RESPONSE',
    );
    mock.restoreAll();
  }
});

test('solo una confirmación completa o un lookup explícito habilitan resolver la cola', async () => {
  for (const body of [{}, [], { found: 'false' }, { found: true }, { found: true, result: {} }]) {
    mock.method(globalThis, 'fetch', async () => Response.json(body));
    await assert.rejects(
      post('operations/lookup'),
      (error: unknown) => error instanceof ApiError && error.code === 'INVALID_RESPONSE',
    );
    mock.restoreAll();
  }
  for (const [path, body] of [
    ['commands/item.add', { operation_id: 'confirmed-id', result: { account: { version: 8 } } }],
    [
      'operations/lookup',
      { found: true, operation_id: 'confirmed-id', result: { account: { version: 8 } } },
    ],
    ['operations/lookup', { found: false }],
  ] as const) {
    mock.method(globalThis, 'fetch', async () => Response.json(body));
    assert.deepEqual(await post(path), body);
    mock.restoreAll();
  }
});

test('el contrato de errores JSON y los fallos de transporte se conservan', async () => {
  mock.method(globalThis, 'fetch', async () =>
    Response.json(
      {
        error: {
          code: 'VERSION_CONFLICT',
          message: 'Actualizá la cuenta.',
          details: { version: 8 },
        },
      },
      { status: 409 },
    ),
  );
  await assert.rejects(post('commands/item.add'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'VERSION_CONFLICT');
    assert.equal(error.message, 'Actualizá la cuenta.');
    assert.deepEqual(error.details, { version: 8 });
    return true;
  });
  mock.restoreAll();
  const connectionError = new TypeError('Connection reset');
  mock.method(globalThis, 'fetch', async () => {
    throw connectionError;
  });
  await assert.rejects(post('commands/item.add'), (error: unknown) => error === connectionError);
});

test('la cola tolera datos locales inválidos conservando las operaciones válidas', () => {
  const valid = entry('keep');
  for (const value of ['null', '{}', 'false', 'broken']) {
    storage.set('baguette.pending.v2.operator', value);
    assert.deepEqual(readPending(), []);
  }
  storage.set(
    'baguette.pending.v2.operator',
    JSON.stringify([
      valid,
      null,
      { ...entry('invalid-body'), body: null },
      { ...entry('invalid-date'), created_at: 'invalid' },
      { ...entry('invalid-state'), state: 'confirmed' },
    ]),
  );
  assert.deepEqual(readPending(), [valid]);
  savePending(readPending());
  setPendingScope('other');
  assert.deepEqual(readPending(), []);
  setPendingScope('operator');
  assert.deepEqual(readPending(), [valid]);
});

test('el envío en segundo plano conserva la cola de su empleado al cambiar el operador activo', () => {
  const first = entry('first');
  const other = entry('other', { actor_id: 'another' });
  savePending([first], 'terminal.operator');
  setPendingScope('another', 'terminal');
  savePending([other]);
  savePending(
    readPending('terminal.operator').filter((p) => p.key !== first.key),
    'terminal.operator',
  );
  assert.deepEqual(readPending(), [other]);
  assert.deepEqual(readPending('terminal.operator'), []);
});

test('la vista de una mesa no mezcla pedidos anteriores de otras mesas ni borra la cola', () => {
  const coffee = entry('coffee', { action: 'order.submit', table_id: 'coffee-table' });
  const pastry = entry('pastry', {
    action: 'order.submit',
    table_id: 'pastry-table',
    state: 'failed',
  });
  const legacy = entry('legacy', { body: { table_id: 'coffee-table' } });
  const unknown = entry('unknown');
  const queue = [pastry, coffee, legacy, unknown];
  savePending(queue);
  assert.deepEqual(pendingForTable(readPending(), 'coffee-table'), [coffee, legacy]);
  assert.deepEqual(pendingForTable(readPending(), 'pastry-table'), [pastry]);
  assert.deepEqual(pendingForTable(readPending(), ''), []);
  assert.deepEqual(readPending(), queue);
});

test('un pedido solo sale de la cola con confirmación completa de su mesa y sus renglones', () => {
  const request = entry('order', {
    action: 'order.submit',
    table_id: 'table',
    body: { items: [{ client_id: 'line' }], item_ids: [] },
  });
  const valid = {
    account: { id: 'account', table_id: 'table', version: 2 },
    items: [{ id: 'line', account_id: 'account', status: 'sent' }],
  };
  assert.deepEqual(confirmedOrder(valid, request), valid);
  for (const result of [
    null,
    {},
    { ...valid, items: [] },
    { ...valid, items: [...valid.items, ...valid.items] },
    { ...valid, items: [...valid.items, { ...valid.items[0], id: 'unexpected' }] },
    { ...valid, account: { ...valid.account, version: 0 } },
    { ...valid, account: { ...valid.account, version: Number.MAX_SAFE_INTEGER + 1 } },
    { ...valid, items: [{ id: 'another', account_id: 'account', status: 'sent' }] },
    { ...valid, account: { ...valid.account, table_id: 'another' } },
  ]) {
    assert.throws(
      () => confirmedOrder(result, request),
      (e: unknown) => e instanceof ApiError && e.status === 502,
    );
  }
});

test('confirmar varias líneas exige todas una sola vez y admite distinto orden', () => {
  const request = entry('order', {
    action: 'order.submit',
    table_id: 'table',
    body: { items: [{ client_id: 'new' }], item_ids: ['previous'] },
  });
  const line = (id: string) => ({ id, account_id: 'account', status: 'sent' });
  const result = {
    account: { id: 'account', table_id: 'table', version: 3 },
    items: [line('new'), line('previous')],
  };
  assert.deepEqual(confirmedOrder(result, request), result);
  for (const items of [
    [line('new'), line('new')],
    [line('previous')],
    [line('new'), line('other')],
  ])
    assert.throws(() => confirmedOrder({ ...result, items }, request), ApiError);
  assert.throws(
    () => confirmedOrder(result, { ...request, body: { item_ids: ['new', 'new'] } }),
    ApiError,
  );
});

test('recuperar una confirmación perdida avanza los siguientes borradores una sola versión', () => {
  const confirmed = entry('first', { state: 'uncertain' });
  const next = entry('second', { created_at: '2026-10-20T14:00:01.000Z' });
  const last = entry('third', { created_at: '2026-10-20T14:00:02.000Z' });
  const original = structuredClone([confirmed, next, last]);
  const remaining = settlePending(original, confirmed, { account: { id: 'account', version: 8 } });
  assert.deepEqual(
    remaining.map((item) => [item.key, item.body.version]),
    [
      ['second', 8],
      ['third', 8],
    ],
  );
  assert.equal(original[1]!.body.version, 7);
  const final = settlePending(remaining, remaining[0]!, { account: { id: 'account', version: 9 } });
  assert.deepEqual(
    final.map((item) => [item.key, item.body.version]),
    [['third', 9]],
  );
});

test('una confirmación no cambia solicitudes ya enviadas ni resuelve cambios de otra persona', () => {
  const confirmed = entry('first', { state: 'uncertain' });
  const protectedEntries = [
    entry('uncertain', { state: 'uncertain' }),
    entry('failed', { state: 'failed' }),
    entry('older', { created_at: '2026-10-20T13:59:59.000Z' }),
    entry('other-actor', { actor_id: 'someone-else' }),
    entry('other-account', { body: { account_id: 'another-account', version: 7 } }),
    entry('other-version', { body: { account_id: 'account', version: 6 } }),
    entry('other-action', { action: 'payment.add' }),
  ];
  assert.deepEqual(
    settlePending([confirmed, ...protectedEntries], confirmed, {
      account: { id: 'account', version: 8 },
    }),
    protectedEntries,
  );
  const next = entry('next');
  for (const result of [
    undefined,
    {},
    { account: { id: 'other', version: 8 } },
    { account: { id: 'account', version: 9 } },
  ])
    assert.deepEqual(settlePending([confirmed, next], confirmed, result), [next]);
});
