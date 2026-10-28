import { test, expect, type Page, type APIRequestContext } from './test';
import { randomUUID } from 'node:crypto';
import { operationGrant } from './pin-helper';
import { chooseSector, createTable, identify } from './shared-helper';
type Entity = {
  id: string;
  version: number;
  account_id: string;
  role: string;
  notes: string;
  concept: string;
  amount_cents: number;
  status: string;
};
type Data = {
  users: Entity[];
  accounts: Entity[];
  items: Entity[];
  payments: Entity[];
  cashMovements: Entity[];
};
async function setup(page: Page) {
  const response = await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: process.env.DEMO_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  const csrf = session.csrf as string;
  async function state(): Promise<Data> {
    return (await page.request.post('/api/state', { data: {} })).json();
  }
  async function command(action: string, body: unknown) {
    const result = await page.request.post(`/api/commands/${action}`, {
      data: body,
      headers: {
        'X-CSRF-Token': csrf,
        'Idempotency-Key': randomUUID(),
        ...(await operationGrant(page, action, body, csrf)),
      },
    });
    expect(result.ok(), await result.text()).toBeTruthy();
    return (await result.json()).result;
  }
  return { state, command, csrf };
}
async function fixture(page: Page) {
  const table = await createTable(page);
  const api = await setup(page);
  const marker = table.label;
  const waiter = (await api.state()).users.find((user) => user.role === 'waiter')!;
  const account = await api.command('account.open', {
    table_id: table.id,
    guests: 1,
    waiter_id: waiter.id,
  });
  return { ...api, marker, table, account };
}
async function openTable(page: Page, label: string) {
  await page.goto('/gestion');
  await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
  await chooseSector(page, 'Salón');
  await page.getByRole('button', { name: new RegExp(`^${label},`) }).click();
  await identify(page, '4101');
}
async function lookupQueue(page: Page) {
  await page.getByRole('button', { name: /En línea.*pendientes/ }).click();
  const queue = page.getByRole('dialog', { name: 'Pendientes' });
  await queue.getByRole('button', { name: 'Sincronizar', exact: true }).click();
  const pin = page.getByRole('dialog', { name: 'Tu PIN' });
  const result = await Promise.race([
    pin.waitFor({ state: 'visible' }).then(() => 'pin'),
    queue
      .getByText('No tenés operaciones pendientes.')
      .waitFor({ state: 'visible' })
      .then(() => 'done'),
  ]);
  if (result === 'pin') {
    await pin.getByLabel('PIN personal').fill('4101');
    await expect(pin).not.toBeVisible();
  }
  await expect(queue.getByText('No tenés operaciones pendientes.')).toBeVisible();
  await queue.getByRole('button', { name: 'Cerrar panel' }).click();
}
async function countPayments(request: APIRequestContext, id: string) {
  const data = (await (await request.post('/api/state', { data: {} })).json()) as Data;
  return data.payments.filter((payment) => payment.account_id === id);
}
test('sin conexión real: recargar, recuperar ítem local y sincronizar una vez', async ({
  page,
  context,
}) => {
  const f = await fixture(page);
  await openTable(page, f.marker);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Agregar 1 Medialuna', exact: true }).click();
  await expect(page.getByRole('button', { name: /Sin conexión.*1 pendientes/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
  await chooseSector(page, 'Salón');
  await page.getByRole('button', { name: new RegExp(`^${f.marker},`) }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Necesitás conexión para identificarte' }),
  ).toBeVisible();
  await expect(page.locator('dialog.order-workspace')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Tu PIN' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Sin conexión.*1 pendientes/ })).toBeVisible();
  await context.setOffline(false);
  await lookupQueue(page);
  expect((await f.state()).items.filter((item) => item.account_id === f.account.id)).toHaveLength(
    1,
  );
});
test('pago con respuesta perdida: no confirmar localmente y consultar misma operación', async ({
  page,
}) => {
  const f = await fixture(page);
  let account = f.account;
  await f.command('item.add', {
    account_id: account.id,
    version: account.version,
    product_id: '30000000-0000-4000-8000-000000000003',
    quantity: 1,
    notes: f.marker,
    addon_ids: [],
  });
  let data = await f.state();
  account = data.accounts.find((value) => value.id === account.id)!;
  const item = data.items.find((value) => value.account_id === account.id)!;
  await f.command('order.send', {
    account_id: account.id,
    version: account.version,
    item_ids: [item.id],
  });
  await openTable(page, f.marker);
  let applied = false;
  await page.route('**/api/commands/payment.add', async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    applied = true;
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Opciones de cuenta', exact: true }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  const payment = page.getByRole('dialog', { name: 'Cobrar cuenta' });
  await payment.getByRole('button', { name: /Confirmar cobro/ }).click();
  await expect(page.getByRole('button', { name: /En línea.*1 pendientes/ })).toBeVisible();
  await expect.poll(() => applied).toBeTruthy();
  await expect(payment.getByRole('button', { name: /Confirmar cobro/ })).toBeDisabled();
  await page.reload();
  await lookupQueue(page);
  expect(await countPayments(page.request, account.id)).toHaveLength(1);
  data = await f.state();
  const current = data.accounts.find((value) => value.id === account.id)!;
  expect((current as unknown as { balance_cents: number }).balance_cents).toBe(0);
  await f.command('account.close', { account_id: current.id, version: current.version });
});
test('movimiento con respuesta perdida: reintento consulta historial sin duplicar caja', async ({
  page,
}) => {
  const api = await setup(page);
  const concept = `Respuesta perdida ${Date.now()}`;
  await page.goto('/gestion#cash');
  await expect(page.getByRole('heading', { name: 'La caja', exact: true })).toBeVisible();
  await page.route('**/api/commands/cash.move', async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Movimiento', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar movimiento' });
  await dialog.getByLabel('Importe ($)').fill('10,01');
  await dialog.getByLabel('Concepto').fill(concept);
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('button', { name: /En línea.*1 pendientes/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar panel' }).click();
  await lookupQueue(page);
  const movements = (await api.state()).cashMovements.filter((row) => row.concept === concept);
  expect(movements).toHaveLength(1);
  expect(movements[0].amount_cents).toBe(1001);
});
