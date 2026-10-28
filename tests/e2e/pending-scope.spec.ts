import { test, expect, type Page } from './test';
import type { Route } from '@playwright/test';
import type { Account, Item, Pending, State } from '../../frontend/src/types/index';
import { identify } from './shared-helper';

const operator = { id: 'queue-operator', name: 'Camarero de prueba', role: 'waiter' as const };
const tableA = '60000000-0000-4000-8000-000000000001';
const tableB = '60000000-0000-4000-8000-000000000002';
const queueStorage = `baguette.pending.v2.terminal.${operator.id}`;
const pastry: Item = {
  id: '60000000-0000-4000-8000-000000000010',
  account_id: '',
  product_id: 'pastry',
  name: 'Medialuna',
  description: '',
  quantity: 1,
  unit_cents: 100,
  notes: '',
  addons: [],
  status: 'draft',
  destination: 'bar',
  created_at: '2026-10-21T14:00:00Z',
};

function previousOrder(state: Pending['state'] = 'failed'): Pending {
  return {
    key: '60000000-0000-4000-8000-000000000020',
    action: 'order.submit',
    actor_id: operator.id,
    table_id: tableA,
    body: {
      table_id: tableA,
      guests: 1,
      items: [
        {
          client_id: pastry.id,
          product_id: pastry.product_id,
          quantity: 1,
          addon_ids: [],
          notes: '',
        },
      ],
      item_ids: [],
    },
    preview: [pastry],
    state,
    error: state === 'failed' ? 'La Medialuna no estaba disponible.' : 'Respuesta perdida.',
    created_at: '2026-10-21T14:00:00Z',
  };
}

async function setup(
  page: Page,
  pending: Pending[] = [],
  submit?: (route: Route) => Promise<void>,
) {
  const snapshot: State = {
    user: { id: 'terminal', name: 'Terminal', role: 'terminal' },
    permissions: ['terminal_view'],
    tables: [tableA, tableB].map((id, index) => ({
      id,
      label: index ? 'B' : 'A',
      sector: 'Salón',
      capacity: 4,
      x: index * 200,
      y: 50,
      active: true,
    })),
    accounts: [],
    items: [],
    products: [
      ['coffee', 'Jarrito'],
      ['pastry', 'Medialuna'],
    ].map(([id, name]) => ({
      id,
      name,
      description: '',
      category_id: 'menu',
      price_cents: 100,
      image_url: null,
      destination: 'bar',
      available: true,
      active: true,
      visible_en_carta: true,
      created_at: '2026-10-21T14:00:00Z',
    })),
    categories: [{ id: 'menu', name: 'Carta', active: true }],
    addons: [],
    users: [],
    cashSessions: [],
    cashMovements: [],
    payments: [],
    refunds: [],
    discounts: [],
    printJobs: [],
    invoices: [],
    files: [],
  };
  await page.addInitScript(
    ({ key, entries }) => localStorage.setItem(key, JSON.stringify(entries)),
    { key: queueStorage, entries: pending },
  );
  const requests: { key: string | undefined; body: Record<string, unknown> }[] = [];
  const lookups: string[] = [];
  const results = new Map<string, unknown>();
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/terminal')
      return route.fulfill({ json: { user: snapshot.user, csrf: 'test', mode: 'terminal' } });
    if (path === '/api/state') return route.fulfill({ json: snapshot });
    if (path === '/api/auth/operational-pin') {
      const tableId = request.postDataJSON().table_id;
      const accounts = snapshot.accounts.filter((account) => account.table_id === tableId);
      return route.fulfill({
        json: {
          token: `token-${request.postDataJSON().table_id}-${lookups.length}`,
          operator,
          permissions: ['operate'],
          expires_in: 600,
          table_state: {
            accounts,
            items: snapshot.items.filter((item) =>
              accounts.some((account) => account.id === item.account_id),
            ),
            payments: [],
            refunds: [],
            discounts: [],
            cashSessions: [],
          },
        },
      });
    }
    if (path === '/api/auth/operator-release') return route.fulfill({ json: { ok: true } });
    if (path === '/api/operations/lookup') {
      const { key } = request.postDataJSON();
      lookups.push(key);
      return route.fulfill({ json: results.get(key) || { found: false } });
    }
    if (path === '/api/commands/order.submit') {
      requests.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() });
      if (submit) return submit(route);
      const body = request.postDataJSON();
      return route.fulfill({
        json: {
          operation_id: 'confirmed-order',
          result: {
            account: { id: 'new-account', table_id: body.table_id, version: 1 },
            items: body.items.map((line: { client_id: string }) => ({
              id: line.client_id,
              account_id: 'new-account',
              status: 'sent',
            })),
          },
        },
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: { code: 'UNEXPECTED_REQUEST', message: path } },
    });
  });
  return { requests, lookups, results, snapshot };
}

async function enter(page: Page, label: 'A' | 'B') {
  await page.getByRole('button', { name: new RegExp(`^${label},`) }).click();
  await identify(page);
  await expect(page.getByRole('dialog', { name: `Mesa ${label}`, exact: true })).toBeVisible();
  return page.locator('dialog.order-workspace');
}

test('un pendiente viejo de medialunas de otra mesa no aparece al enviar un cafe', async ({
  page,
}) => {
  const oldOrder = previousOrder();
  const data = await setup(page, [oldOrder]);
  await page.goto('/');
  const workspace = await enter(page, 'B');
  await expect(workspace.getByRole('button', { name: /^Pendientes/ })).toHaveCount(0);
  await expect(workspace.locator('.order-sync-status')).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Agregar 1 Jarrito' }).click();
  await workspace.getByRole('button', { name: 'Enviar pedido (1)' }).click();
  await expect(workspace).toHaveCount(0);
  await expect.poll(() => data.requests.length).toBe(1);
  expect(data.requests[0]!.body.table_id).toBe(tableB);
  expect(data.requests[0]!.body.items).toEqual([
    expect.objectContaining({ product_id: 'coffee', quantity: 1 }),
  ]);
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), queueStorage))
    .toEqual([oldOrder]);

  const originalTable = await enter(page, 'A');
  await originalTable.getByRole('button', { name: 'Pendientes (1)' }).click();
  const queue = page.getByRole('dialog', { name: 'Pendientes', exact: true });
  await expect(queue.getByText('Mesa A', { exact: true })).toBeVisible();
  await expect(queue.getByText('1 × Medialuna', { exact: true })).toBeVisible();
  await expect(queue.locator('.pending-entry')).toHaveCount(1);
});

test('un error tardio de la mesa anterior no se muestra dentro de la mesa actual', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const data = await setup(page, [], async (route) => {
    await gate;
    await route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Sin respuesta.' } },
    });
  });
  await page.goto('/');
  const first = await enter(page, 'A');
  await first.getByRole('button', { name: 'Agregar 1 Medialuna' }).click();
  await first.getByRole('button', { name: 'Enviar pedido (1)' }).click();
  await expect(first).toHaveCount(0);
  await expect.poll(() => data.requests.length).toBe(1);
  await page.getByRole('button', { name: /^B,/ }).click();
  const pin = page.getByRole('dialog', { name: 'Tu PIN' });
  await pin.getByLabel('PIN personal').fill('4303');
  await expect(pin.getByRole('status')).toHaveText('Terminando envío anterior…');
  release();
  await expect(pin).toHaveCount(0);
  const second = page.locator('dialog.order-workspace');
  await expect
    .poll(async () => {
      const stored = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || '[]'),
        queueStorage,
      );
      return stored[0]?.error;
    })
    .toBe('Sin respuesta.');
  await expect(second.locator('.order-error')).toHaveCount(0);
  await expect(second.locator('.order-sync-status')).toHaveCount(0);
  await expect(second.getByRole('button', { name: /^Pendientes/ })).toHaveCount(0);
});

test('al reingresar se consulta un pedido ya confirmado sin reenviarlo ni mezclar otras mesas', async ({
  page,
}) => {
  const oldOrder = previousOrder('uncertain');
  const unrelated = {
    ...previousOrder(),
    key: '60000000-0000-4000-8000-000000000021',
    table_id: tableB,
  };
  const data = await setup(page, [oldOrder, unrelated]);
  data.results.set(oldOrder.key, {
    found: true,
    operation_id: 'confirmed-previous-order',
    result: {
      account: { id: 'previous-account', table_id: tableA, version: 1 },
      items: [{ ...pastry, account_id: 'previous-account', status: 'sent' }],
    },
  });
  await page.goto('/');
  const workspace = await enter(page, 'A');
  await expect.poll(() => data.lookups).toContain(oldOrder.key);
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), queueStorage))
    .toEqual([unrelated]);
  await expect(workspace.getByRole('button', { name: /^Pendientes/ })).toHaveCount(0);
  await expect(workspace.locator('.order-sync-status')).toHaveCount(0);
  expect(data.requests).toEqual([]);
  expect(data.lookups).not.toContain(unrelated.key);
});

test('un cafe nuevo no envia implicitamente una medialuna vieja inactiva de la cuenta', async ({
  page,
}) => {
  const data = await setup(page);
  const account: Account = {
    id: '60000000-0000-4000-8000-000000000030',
    table_id: tableA,
    waiter_id: operator.id,
    guests: 1,
    status: 'open',
    version: 3,
    subtotal_cents: 100,
    discount_cents: 0,
    total_cents: 100,
    paid_cents: 0,
    balance_cents: 100,
    created_at: '2026-10-21T14:00:00Z',
  };
  const previous = { ...pastry, account_id: account.id };
  data.snapshot.accounts = [account];
  data.snapshot.items = [previous];
  data.snapshot.products.find((product) => product.id === 'pastry')!.active = false;
  const sent: Record<string, unknown>[] = [];
  await page.route('**/api/commands/order.submit', async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    if (body.item_ids.includes(previous.id)) {
      await route.fulfill({
        status: 422,
        json: {
          error: { code: 'PRODUCT_UNAVAILABLE', message: 'Revisá la disponibilidad de Medialuna.' },
        },
      });
      return;
    }
    const confirmed = body.items.map(
      (line: { client_id: string; quantity: number; notes: string }) => ({
        ...pastry,
        id: line.client_id,
        account_id: account.id,
        product_id: 'coffee',
        name: 'Jarrito',
        quantity: line.quantity,
        notes: line.notes,
        status: 'sent',
      }),
    );
    const updated = {
      ...account,
      version: 4,
      subtotal_cents: 200,
      total_cents: 200,
      balance_cents: 200,
    };
    data.snapshot.accounts = [updated];
    data.snapshot.items = [previous, ...confirmed];
    await route.fulfill({
      json: { operation_id: 'coffee-confirmed', result: { account: updated, items: confirmed } },
    });
  });
  await page.goto('/');
  const workspace = await enter(page, 'A');
  const earlier = workspace.getByRole('region', {
    name: 'Cargas anteriores sin enviar',
    exact: true,
  });
  await expect(earlier.getByText('Medialuna', { exact: true })).toBeVisible();
  await expect(
    workspace.getByRole('button', { name: 'Enviar cargas anteriores (1)', exact: true }),
  ).toBeVisible();
  await workspace.getByRole('button', { name: 'Agregar 1 Jarrito', exact: true }).click();
  await expect(
    workspace.getByRole('button', { name: 'Enviar cargas anteriores (1)', exact: true }),
  ).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Enviar pedido (1)', exact: true }).click();
  await expect(workspace).toHaveCount(0);
  await expect(page.getByText('Mesa A: pedido confirmado.', { exact: true })).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]!.item_ids).toEqual([]);
  expect(sent[0]!.items).toEqual([expect.objectContaining({ product_id: 'coffee', quantity: 1 })]);
  expect(data.snapshot.items.find((item) => item.id === previous.id)).toEqual(previous);
  expect(previous.status).toBe('draft');
  await enter(page, 'A');
  await expect(earlier.getByText('Medialuna', { exact: true })).toBeVisible();
  await expect(
    workspace.getByRole('button', { name: 'Enviar cargas anteriores (1)', exact: true }),
  ).toBeVisible();
  await expect(workspace.getByRole('button', { name: /^Pendientes/ })).toHaveCount(0);
});
