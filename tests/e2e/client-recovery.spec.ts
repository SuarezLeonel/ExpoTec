import { test, expect } from './test';
import type { Pending, State } from '../../frontend/src/types/index';

test('recuperar una respuesta perdida permite continuar la cola sin duplicar el primer ítem', async ({
  page,
}) => {
  const user = { id: 'recovery-operator', name: 'Operador Prueba', role: 'admin' as const };
  const first: Pending = {
    key: 'recovery-first',
    action: 'item.add',
    actor_id: user.id,
    state: 'uncertain',
    created_at: '2026-10-20T14:00:00.000Z',
    body: { account_id: 'recovery-account', version: 7, product_id: 'coffee', quantity: 1 },
  };
  const second: Pending = {
    ...first,
    key: 'recovery-second',
    state: 'pending',
    created_at: '2026-10-20T14:00:01.000Z',
  };
  const snapshot: State = {
    user,
    permissions: ['operate'],
    tables: [
      {
        id: 'recovery-table',
        label: 'Recuperación',
        sector: 'Pruebas',
        capacity: 4,
        x: 0,
        y: 0,
        active: true,
      },
    ],
    accounts: [],
    items: [],
    products: [],
    categories: [],
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
    ({ operator, pending }) => {
      localStorage.setItem(`baguette.pending.v2.${operator}`, JSON.stringify(pending));
    },
    { operator: user.id, pending: [first, second] },
  );
  const sent: { key: string | undefined; body: Record<string, unknown> }[] = [];
  let firstLookupResult: unknown = {};
  let lookupCount = 0;
  let authorized = false;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const routePath = new URL(request.url()).pathname;
    if (routePath === '/api/auth/session') {
      await route.fulfill({ json: { user, csrf: 'recovery-csrf', mode: 'management' } });
    } else if (routePath === '/api/auth/operational-pin') {
      authorized = true;
      await route.fulfill({
        json: {
          token: 'recovery-token',
          expires_in: 60,
          operator: user,
          permissions: ['operate'],
        },
      });
    } else if (routePath === '/api/state') {
      await route.fulfill({ json: snapshot });
    } else if (routePath === '/api/operations/lookup') {
      const { key } = request.postDataJSON();
      lookupCount += 1;
      await route.fulfill({
        json: key === first.key ? firstLookupResult : { found: false },
      });
    } else if (routePath === '/api/commands/item.add') {
      if (!authorized) {
        await route.fulfill({
          status: 403,
          json: {
            error: {
              code: 'PIN_REQUIRED',
              message: 'Ingresá tu PIN.',
              details: { table_id: 'recovery-table' },
            },
          },
        });
        return;
      }
      sent.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() });
      await route.fulfill({
        json: {
          operation_id: 'recovery-second-id',
          result: { account: { id: 'recovery-account', version: 9 } },
        },
      });
    } else {
      await route.fulfill({
        status: 404,
        json: { error: { code: 'UNEXPECTED_REQUEST', message: routePath } },
      });
    }
  });
  await page.goto('/gestion');
  await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /2 pendientes/ }).click();
  const queue = page.getByRole('dialog', { name: 'Pendientes' });
  for (const [index, invalid] of [{}, []].entries()) {
    firstLookupResult = invalid;
    await queue.getByRole('button', { name: 'Sincronizar' }).first().click();
    await expect.poll(() => lookupCount).toBe(index + 1);
    await expect(page.getByText(/El servidor no devolvió una confirmación válida/)).toBeVisible();
    await expect(queue.locator('.pending-entry')).toHaveCount(2);
    expect(sent).toEqual([]);
  }
  firstLookupResult = {
    found: true,
    operation_id: 'recovery-first-id',
    result: { account: { id: 'recovery-account', version: 8 } },
  };
  await queue.getByRole('button', { name: 'Sincronizar' }).first().click();
  await expect(queue.locator('.pending-entry')).toHaveCount(1);
  expect(sent).toEqual([]);
  await queue.getByRole('button', { name: 'Sincronizar' }).click();
  const pin = page.getByRole('dialog', { name: 'Tu PIN' });
  await pin.getByLabel('PIN personal').fill('4101');
  await expect(pin).not.toBeVisible();
  await expect(queue.getByText('No tenés operaciones pendientes.')).toBeVisible();
  expect(sent).toEqual([{ key: second.key, body: { ...second.body, version: 8 } }]);
  expect(
    await page.evaluate(
      (operator) => JSON.parse(localStorage.getItem(`baguette.pending.v2.${operator}`) || '[]'),
      user.id,
    ),
  ).toEqual([]);
  await queue.getByRole('button', { name: 'Cerrar panel' }).click();
  await expect(queue).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Mesa Recuperación', exact: true })).toHaveCount(0);
});
