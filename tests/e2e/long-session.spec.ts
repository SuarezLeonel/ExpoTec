import { test, expect } from './test';
import type { State } from '../../frontend/src/types/index';

const operator = {
  id: '50000000-0000-4000-8000-000000000003',
  name: 'Operador de prueba',
  role: 'waiter' as const,
};
const tableId = '40000000-0000-4000-8000-000000000001';
const empty: State = {
  user: { ...operator, role: 'terminal' },
  permissions: ['terminal_view'],
  tables: [
    { id: tableId, label: 'Larga', sector: 'Salón', capacity: 4, active: true, x: 40, y: 40 },
  ],
  accounts: [],
  items: [],
  products: [
    {
      id: '30000000-0000-4000-8000-000000000003',
      name: 'Medialuna',
      description: '',
      category_id: '10000000-0000-4000-8000-000000000003',
      price_cents: 180000,
      image_url: '',
      destination: 'none',
      active: true,
      available: true,
      visible_en_carta: true,
      addon_ids: [],
    },
  ],
  categories: [{ id: '10000000-0000-4000-8000-000000000003', name: 'Panadería', active: true }],
  addons: [],
  users: [operator],
  cashSessions: [],
  cashMovements: [],
  payments: [],
  refunds: [],
  discounts: [],
  printJobs: [],
  invoices: [],
  files: [],
};

test('la actualización lenta no acumula consultas de estado', async ({ page }) => {
  await page.clock.install();
  let requests = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/**', async (route) => {
    if (route.request().url().endsWith('/auth/terminal')) {
      await route.fulfill({ json: { user: empty.user, csrf: 'test-csrf', mode: 'terminal' } });
    } else {
      requests++;
      if (requests > 1) await gate;
      await route.fulfill({ json: empty });
    }
  });
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
    expect(requests).toBe(1);
    await page.clock.runFor(7000);
    await expect.poll(() => requests).toBe(2);
    await page.clock.runFor(21_000);
    expect(requests).toBe(2);
  } finally {
    release();
  }
});

test('confirmar un pedido reemplaza una lectura anterior al guardado sin volver a mostrar la mesa libre', async ({
  page,
}) => {
  await page.clock.install();
  let started = false;
  let committed = false;
  let staleStarted = false;
  let commit!: () => void;
  let releaseStale!: () => void;
  const commitGate = new Promise<void>((resolve) => {
    commit = resolve;
  });
  const staleGate = new Promise<void>((resolve) => {
    releaseStale = resolve;
  });
  const account = {
    id: '60000000-0000-4000-8000-000000000001',
    table_id: tableId,
    waiter_id: operator.id,
    version: 2,
    guests: 1,
    status: 'open',
    subtotal_cents: 180000,
    total_cents: 180000,
    paid_cents: 0,
    discount_cents: 0,
    balance_cents: 180000,
    created_at: new Date().toISOString(),
  };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/terminal'))
      return route.fulfill({ json: { user: empty.user, csrf: 'test-csrf', mode: 'terminal' } });
    if (path.endsWith('/auth/operational-pin'))
      return route.fulfill({
        json: {
          token: 'a'.repeat(64),
          operator,
          permissions: ['operate'],
          expires_in: 600,
          table_state: {
            accounts: [],
            items: [],
            payments: [],
            refunds: [],
            discounts: [],
            cashSessions: [],
          },
        },
      });
    if (path.endsWith('/state')) {
      if (started && !committed) {
        staleStarted = true;
        await staleGate;
        return route.fulfill({ json: empty });
      }
      return route.fulfill({ json: { ...empty, accounts: committed ? [account] : [] } });
    }
    if (path.endsWith('/commands/order.submit')) {
      const line = route.request().postDataJSON().items[0];
      started = true;
      await commitGate;
      committed = true;
      return route.fulfill({
        json: {
          operation_id: 'test-operation',
          result: {
            account,
            items: [{ id: line.client_id, account_id: account.id, status: 'sent' }],
          },
        },
      });
    }
    return route.fulfill({ json: { ok: true } });
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: /^Larga,/ }).click();
    await page.getByLabel('PIN personal').fill('4303');
    await page.getByRole('button', { name: 'Agregar 1 Medialuna' }).click();
    await page.getByRole('button', { name: 'Enviar pedido (1)' }).click();
    await expect.poll(() => staleStarted).toBe(true);
    commit();
    await expect(page.getByText('Mesa Larga: pedido confirmado.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Larga, 1 cuentas/ })).toBeVisible();
    releaseStale();
    await expect(page.getByRole('button', { name: /^Larga, 1 cuentas/ })).toBeVisible();
  } finally {
    commit();
    releaseStale();
  }
});

test('la sesión técnica vencida se recupera sin F5 y conserva el borrador detrás del PIN', async ({
  page,
}) => {
  await page.clock.install();
  let bootstraps = 0;
  let expired = false;
  let documents = 0;
  let commands = 0;
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documents++;
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/terminal')) {
      bootstraps++;
      return route.fulfill({
        json: { user: empty.user, csrf: `test-csrf-${bootstraps}`, mode: 'terminal' },
      });
    }
    if (path.endsWith('/auth/operational-pin'))
      return route.fulfill({
        json: {
          token: 'a'.repeat(64),
          operator,
          permissions: ['operate'],
          expires_in: 600,
          table_state: {
            accounts: [],
            items: [],
            payments: [],
            refunds: [],
            discounts: [],
            cashSessions: [],
          },
        },
      });
    if (path.endsWith('/state'))
      return expired && bootstraps === 1
        ? route.fulfill({
            status: 401,
            json: { error: { code: 'UNAUTHENTICATED', message: 'La sesión venció.' } },
          })
        : route.fulfill({ json: empty });
    if (path.includes('/commands/')) commands++;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^Larga,/ }).click();
  await page.getByLabel('PIN personal').fill('4303');
  const workspace = page.locator('dialog.order-workspace');
  await workspace.getByRole('button', { name: 'Agregar 1 Medialuna' }).click();
  await workspace.getByRole('button', { name: 'Nota', exact: true }).click();
  await workspace.getByLabel('Observaciones', { exact: true }).fill('Conservar al vencer');
  await workspace.getByRole('button', { name: 'Guardar nota' }).click();
  expired = true;
  await page.clock.runFor(7000);
  await expect.poll(() => bootstraps).toBe(2);
  await expect(workspace).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
  expect(documents).toBe(1);
  expect(commands).toBe(0);
  await page.getByRole('button', { name: /^Larga,/ }).click();
  await expect(page.getByLabel('PIN personal')).toBeVisible();
  await page.getByLabel('PIN personal').fill('4303');
  await expect(workspace.getByText('Conservar al vencer', { exact: true })).toBeVisible();
  await expect(workspace.getByLabel('Cantidad de Medialuna', { exact: true })).toHaveText('1');
});

test('Gestión vencida pide login sin F5 y conserva la cola pendiente', async ({ page }) => {
  await page.clock.install();
  const user = { ...operator, role: 'admin' };
  const queueKey = `baguette.pending.v2.${operator.id}`;
  const pending = [
    {
      key: 'uncertain-operation',
      action: 'payment.add',
      actor_id: operator.id,
      table_id: tableId,
      state: 'uncertain',
      created_at: new Date().toISOString(),
      body: { account_id: 'account' },
    },
  ];
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: queueKey,
    value: pending,
  });
  let expired = false;
  await page.route('**/api/**', async (route) => {
    if (route.request().url().endsWith('/auth/session'))
      return route.fulfill({ json: { user, csrf: 'test-csrf', mode: 'management' } });
    return expired
      ? route.fulfill({
          status: 401,
          json: { error: { code: 'UNAUTHENTICATED', message: 'La sesión venció.' } },
        })
      : route.fulfill({ json: { ...empty, user, permissions: ['operate', 'cash'] } });
  });
  await page.goto('/gestion');
  await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
  expired = true;
  await page.clock.runFor(7000);
  await expect(page.getByLabel(/^Usuario/)).toBeVisible();
  await expect(page.getByText(/Tu sesión venció/)).toBeVisible();
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), queueKey),
  ).toEqual(pending);
});

test('sesión repetitiva: pedidos y paneles no acumulan memoria, nodos ni listeners', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/terminal'))
      return route.fulfill({ json: { user: empty.user, csrf: 'test-csrf', mode: 'terminal' } });
    if (path.endsWith('/auth/operational-pin'))
      return route.fulfill({
        json: {
          token: 'a'.repeat(64),
          operator,
          permissions: ['operate'],
          expires_in: 600,
          table_state: {
            accounts: [],
            items: [],
            payments: [],
            refunds: [],
            discounts: [],
            cashSessions: [],
          },
        },
      });
    if (path.endsWith('/state')) return route.fulfill({ json: empty });
    if (path.endsWith('/commands/order.submit')) {
      const body = request.postDataJSON();
      const account = {
        id: '60000000-0000-4000-8000-000000000001',
        table_id: tableId,
        waiter_id: operator.id,
        version: 2,
        guests: 1,
        status: 'open',
        subtotal_cents: 180000,
        total_cents: 180000,
        paid_cents: 0,
        discount_cents: 0,
        balance_cents: 180000,
        created_at: new Date().toISOString(),
      };
      const items = body.items.map(
        (line: { client_id: string; quantity: number; notes: string }) => ({
          ...empty.products[0],
          id: line.client_id,
          product_id: empty.products[0]!.id,
          account_id: account.id,
          quantity: line.quantity,
          notes: line.notes,
          addons: [],
          status: 'sent',
          unit_cents: 180000,
        }),
      );
      return route.fulfill({
        json: { operation_id: 'test-operation', result: { account, items } },
      });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  async function metrics() {
    await cdp.send('HeapProfiler.collectGarbage');
    const dom = await cdp.send('Memory.getDOMCounters');
    const performance = await cdp.send('Performance.getMetrics');
    return { ...dom, heap: performance.metrics.find((m) => m.name === 'JSHeapUsedSize')!.value };
  }
  const latency: number[] = [];
  async function cycle() {
    await page.getByRole('button', { name: /^Larga,/ }).click();
    await page.getByLabel('PIN personal').fill('4303');
    const workspace = page.locator('dialog.order-workspace');
    await expect(workspace).toBeVisible();
    const elapsed = await workspace.getByRole('button', { name: 'Agregar 1 Medialuna' }).evaluate(
      (element) =>
        new Promise<number>((resolve) => {
          const start = performance.now();
          const observer = new MutationObserver(() => {
            if (!document.querySelector('.local-order-items .order-line')) return;
            observer.disconnect();
            requestAnimationFrame(() => resolve(performance.now() - start));
          });
          observer.observe(document.body, { childList: true, subtree: true });
          (element as HTMLButtonElement).click();
        }),
    );
    latency.push(elapsed);
    await workspace.getByRole('button', { name: 'Nota', exact: true }).click();
    await workspace.getByLabel('Observaciones', { exact: true }).fill('Sin azúcar');
    await workspace.getByRole('button', { name: 'Guardar nota' }).click();
    await workspace.getByRole('button', { name: 'Enviar pedido (1)' }).click();
    await expect(workspace).toHaveCount(0);
    await expect(page.getByText('Mesa Larga: pedido confirmado.', { exact: true })).toBeVisible();
    await expect(page.locator('dialog')).toHaveCount(0);
  }
  for (let i = 0; i < 10; i++) await cycle();
  const baseline = await metrics();
  for (let i = 0; i < 30; i++) await cycle();
  const halfway = await metrics();
  for (let i = 0; i < 30; i++) await cycle();
  const final = await metrics();
  const emptyDraftKeys = await page.evaluate(
    () =>
      Object.keys(localStorage).filter((key) => key.startsWith('baguette.local-order.v1.')).length,
  );
  const median = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const result = {
    cycles: 70,
    baseline,
    halfway,
    final,
    emptyDraftKeys,
    earlyAddMs: median(latency.slice(10, 30)),
    lateAddMs: median(latency.slice(-20)),
  };
  await test.info().attach('long-session.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  expect(final.nodes).toBeLessThanOrEqual(baseline.nodes + 50);
  expect(emptyDraftKeys).toBe(0);
  expect(final.jsEventListeners).toBeLessThanOrEqual(baseline.jsEventListeners + 8);
  expect(final.documents).toBeLessThanOrEqual(baseline.documents + 1);
  expect(final.heap).toBeLessThanOrEqual(
    baseline.heap + Math.max(2 * 1024 * 1024, baseline.heap * 0.25),
  );
  expect(result.lateAddMs).toBeLessThan(200);
  expect(result.lateAddMs).toBeLessThan(result.earlyAddMs + 50);
  await cdp.detach();
});
