import { test, expect, type Page } from './test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { operationGrant } from './pin-helper';
import { chooseSector, createTable, identify } from './shared-helper';
type Row = {
  id: string;
  version: number;
  role: string;
  account_id: string;
  status: string;
  method: string;
  amount_cents: number;
  balance_cents: number;
};
async function prepare(page: Page, username = 'admin') {
  const auth = await page.request.post('/api/auth/login', {
    data: { username, password: process.env.DEMO_PASSWORD },
  });
  expect(auth.ok()).toBeTruthy();
  const session = await auth.json();
  const command = async (action: string, body: unknown) => {
    const response = await page.request.post(`/api/commands/${action}`, {
      data: body,
      headers: {
        'X-CSRF-Token': session.csrf,
        'Idempotency-Key': randomUUID(),
        ...(await operationGrant(page, action, body, session.csrf)),
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).result;
  };
  const state = async () => (await page.request.post('/api/state', { data: {} })).json();
  return { command, state };
}
test('pedido enviado permite cobrar y cerrar sin etapas de cocina ni entrega', async ({ page }) => {
  const table = await createTable(page);
  const api = await prepare(page);
  const label = table.label;
  const users = (await api.state()).users as Row[];
  const waiter = users.find((user) => user.role === 'waiter')!;
  let account = await api.command('account.open', {
    table_id: table.id,
    guests: 2,
    waiter_id: waiter.id,
  });
  for (const id of [
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
  ]) {
    await api.command('item.add', {
      account_id: account.id,
      version: account.version,
      product_id: id,
      quantity: 1,
      notes: label,
      addon_ids: [],
    });
    account = ((await api.state()).accounts as Row[]).find((row) => row.id === account.id)!;
  }
  const items = ((await api.state()).items as Row[]).filter((row) => row.account_id === account.id);
  await api.command('order.send', {
    account_id: account.id,
    version: account.version,
    item_ids: items.map((item) => item.id),
  });
  await page.goto('/gestion');
  await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${label},`) }).click();
  await identify(page, '4101');
  await expect(page.getByRole('button', { name: 'Cobrar', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Opciones de cuenta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cobrar', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Solicitar cuenta', exact: true }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  let payment = page.getByRole('dialog', { name: 'Cobrar cuenta' });
  await payment.getByLabel('Medio de pago').selectOption('debit');
  await payment.getByLabel('Importe aplicado ($)').fill('5000');
  await payment.getByRole('button', { name: /Confirmar cobro/ }).click();
  await expect(payment).not.toBeVisible();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  payment = page.getByRole('dialog', { name: 'Cobrar cuenta' });
  await payment.getByLabel('Efectivo recibido ($)').fill('6000');
  await expect(payment.getByText(/Vuelto:/)).toContainText('1.000,00');
  await payment.getByRole('button', { name: /Confirmar cobro/ }).click();
  await expect(payment).not.toBeVisible();
  await page.getByRole('button', { name: 'Cerrar cuenta', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Cerrar cuenta' })
    .getByRole('button', { name: 'Confirmar', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Cerrar cuenta', exact: true })).not.toBeVisible();
  await page
    .getByRole('dialog', { name: `Mesa ${label}`, exact: true })
    .locator(':scope > .sheet-heading')
    .getByRole('button', { name: 'Cerrar panel', exact: true })
    .click();
  await expect(page.getByRole('button', { name: new RegExp(`^${label}, libre`) })).toBeVisible();
  const state = await api.state();
  const payments = (state.payments as Row[]).filter((row) => row.account_id === account.id);
  expect(payments).toHaveLength(2);
  expect(payments.map((row) => row.method).sort()).toEqual(['cash', 'debit']);
  expect(payments.reduce((sum, row) => sum + row.amount_cents, 0)).toBe(1000000);
});
test('crear producto desde gestión y verificar misma carta pública e imprimible', async ({
  page,
}) => {
  await prepare(page);
  const name = `Budín demo ${Date.now()}`;
  await page.goto('/gestion#catalog');
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^Nombre\s*\*?$/ }).fill(name);
  await dialog.getByLabel('Precio ($)').fill('1234,56');
  await dialog.getByLabel('Descripción').fill('Producto ficticio creado durante la prueba.');
  await dialog
    .getByLabel('Categoría', { exact: false })
    .selectOption('10000000-0000-4000-8000-000000000003');
  await dialog.getByLabel('Destino de preparación').selectOption('none');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.goto('/carta');
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  const menu = await (await page.request.post('/api/public/menu', { data: {} })).json();
  expect(menu.products.find((row: { name: string }) => row.name === name).price_cents).toBe(123456);
  const printable = await (await page.request.post('/api/public/menu/print', { data: {} })).json();
  expect(Buffer.from(printable.content_base64, 'base64').toString()).toContain(name);
});
test('navegación operativa y formularios sin infracciones automáticas en ambos temas', async ({
  page,
}) => {
  await prepare(page);
  for (const theme of ['light', 'dark']) {
    await page.goto('/gestion');
    await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
    if (theme === 'dark') await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
    for (const [hash, title] of [
      ['cash', 'La caja'],
      ['catalog', 'Catálogo'],
      ['users', 'Usuarios'],
      ['services', 'Servicios de la demo'],
      ['audit', 'Auditoría'],
    ]) {
      await page.goto(`/gestion#${hash}`);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      const report = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(report.violations, `${theme} ${hash}`).toEqual([]);
    }
  }
});
