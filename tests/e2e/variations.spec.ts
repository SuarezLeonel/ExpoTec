import { test, expect, type Page } from './test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import {
  chooseSector,
  createTable,
  identify,
  managementState,
  manager,
  reopenAfterSend,
} from './shared-helper';

async function fixture(page: Page, dense = false) {
  const csrf = await manager(page);
  async function save(action: string, data: unknown, status = 200) {
    const response = await page.request.post(`/api/commands/${action}`, {
      data,
      headers: { 'X-CSRF-Token': csrf, 'Idempotency-Key': randomUUID() },
    });
    expect(response.status(), await response.text()).toBe(status);
    return (await response.json()).result;
  }
  const tag = Date.now().toString().slice(-7);
  const family = `Café ${tag}`;
  const category = await save('category.save', { name: `Variantes ${tag}`, active: true });
  const base = {
    category_id: category.id,
    name: `Café con leche ${tag}`,
    description: 'Preparado al momento.',
    price_cents: 650000,
    image_url: '',
    destination: 'bar',
    available: true,
    active: true,
    visible_en_carta: true,
    addon_ids: ['20000000-0000-4000-8000-000000000001'],
    variant_group: family,
    variant_name: 'Con leche',
  };
  await save('product.save', { ...base, variant_name: '' }, 422);
  const milk = await save('product.save', base);
  const double = await save('product.save', {
    ...base,
    name: `Café doble ${tag}`,
    price_cents: 660000,
    variant_name: 'Doble',
    addon_ids: [],
  });
  await save('product.save', {
    ...base,
    name: `Descafeinado ${tag}`,
    price_cents: 460000,
    variant_name: 'Descafeinado',
    available: false,
  });
  await save('product.save', {
    ...base,
    name: `Interno ${tag}`,
    variant_name: 'Interno',
    visible_en_carta: false,
  });
  if (dense)
    for (const label of ['Ristretto', 'En pocillo', 'En jarrito', 'Con crema', 'Doble con crema']) {
      await save('product.save', { ...base, name: `Café ${label} ${tag}`, variant_name: label });
    }
  // Older clients that omit variation fields must preserve an existing family.
  const { variant_group: _group, variant_name: _variant, ...legacy } = base;
  const updated = await save('product.save', { ...legacy, id: milk.id });
  expect(updated.variant_group).toBe(family);
  expect(updated.variant_name).toBe('Con leche');
  return { family, category, milk, double };
}

test('tocar una variante carga una unidad local, repetir suma y las notas se editan desde el pedido', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const data = await fixture(page);
  const table = await createTable(page);
  await page.goto('/carta');
  const menuGroup = page
    .locator('.menu-product')
    .filter({ has: page.getByRole('heading', { name: data.family, exact: true }) });
  await expect(menuGroup.getByText('Con leche', { exact: true })).toBeVisible();
  await expect(menuGroup.getByText('Doble', { exact: true })).toBeVisible();
  await expect(menuGroup.getByText('Sin disponibilidad')).toBeVisible();
  await expect(menuGroup.getByText('Interno', { exact: true })).toHaveCount(0);
  await page.goto('/');
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  const workspace = page.locator('dialog.order-workspace');
  await workspace
    .getByRole('searchbox', { name: 'Buscar producto' })
    .fill(`${data.family.replace('é', 'e')} leche`);
  await expect(workspace.locator('.product-tile')).toHaveCount(1);
  const family = workspace.getByRole('button', { name: new RegExp(`^${data.family} `) });
  await family.click();
  const picker = workspace.getByRole('region', { name: 'Opciones de producto' });
  await expect(picker.getByRole('button', { name: 'Agregar al pedido' })).toHaveCount(0);
  await expect(picker.getByLabel('Observaciones', { exact: true })).toHaveCount(0);
  await expect(picker.getByLabel('Cantidad', { exact: true })).toHaveCount(0);
  await expect(picker.getByRole('button', { name: /Descafeinado/ })).toBeDisabled();
  const addon = picker.getByRole('checkbox', { name: 'Leche vegetal', exact: true });
  await addon.check();
  await expect(picker.getByRole('button', { name: /^Doble/ })).toBeDisabled();
  await picker.getByRole('button', { name: 'Volver a productos' }).click();
  await expect(family).toBeFocused();
  await family.click();
  await expect(addon).toBeChecked();
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/commands/')) requests.push(request.url());
  });
  await picker.getByRole('button', { name: 'Con leche', exact: true }).click();
  await picker.getByRole('button', { name: 'Con leche', exact: true }).click();
  const item = workspace
    .locator('.local-order-items .account-item')
    .filter({ hasText: data.milk.name });
  await expect(item).toHaveCount(1);
  await expect(item.getByLabel(`Cantidad de ${data.milk.name}`, { exact: true })).toHaveText('2');
  expect(requests).toEqual([]);
  await expect(workspace.getByLabel('Observaciones', { exact: true })).toHaveCount(0);
  await item.getByRole('button', { name: 'Nota', exact: true }).click();
  await expect(item.getByLabel('Observaciones', { exact: true })).toBeFocused();
  await item.getByLabel('Observaciones', { exact: true }).fill('Servir primero');
  await expect(
    workspace.getByRole('button', { name: 'Enviar pedido (1)', exact: true }),
  ).toBeDisabled();
  await item.getByRole('button', { name: 'Guardar nota' }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/variantes-directas-escritorio.png' });
  await workspace.getByRole('button', { name: 'Enviar pedido (1)', exact: true }).click();
  await expect(workspace).toHaveCount(0);
  await reopenAfterSend(page, table.label);
  await expect(workspace.getByRole('button', { name: /^Pendientes/ })).toHaveCount(0);
  const state = await managementState(page);
  const saved = state.items.find(
    (i: { product_id: string; notes: string }) =>
      i.product_id === data.milk.id && i.notes === 'Servir primero',
  );
  expect(saved.quantity).toBe(2);
  expect(saved.unit_cents).toBe(650000);
  expect(saved.addons[0].price_cents).toBe(80000);
  expect(saved.status).toBe('sent');
});

test('nueve variantes de carga directa entran sin desplazar en celular, tablet y escritorio', async ({
  page,
}) => {
  const data = await fixture(page, true);
  const table = await createTable(page);
  await page.goto('/');
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  const workspace = page.locator('dialog.order-workspace');
  await workspace.getByRole('button', { name: `${data.family} 8 variantes`, exact: true }).click();
  const picker = workspace.getByRole('region', { name: 'Opciones de producto' });
  await expect(picker.locator('.variant-option')).toHaveCount(9);
  for (const [width, height] of [
    [1440, 768],
    [1180, 720],
    [1024, 768],
    [870, 668],
    [768, 844],
    [390, 844],
    [320, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const sizes = await picker
      .locator('.composer-fields')
      .evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
    expect(sizes.scroll, `${width}x${height}`).toBeLessThanOrEqual(sizes.client + 1);
    expect(await workspace.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(picker.getByRole('button', { name: 'En jarrito', exact: true })).toBeInViewport();
    expect(
      await picker
        .locator('.variant-option')
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(15);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await picker.getByRole('button', { name: 'En jarrito', exact: true }).click();
  await expect(picker).toBeVisible();
  await page.screenshot({ path: 'test-results/variantes-directas-movil.png' });
  await workspace.getByRole('button', { name: 'Pedido (1)', exact: true }).click();
  await workspace.getByRole('button', { name: 'Nota', exact: true }).click();
  await workspace.getByLabel('Observaciones', { exact: true }).fill('En jarrito caliente');
  await workspace.getByRole('button', { name: 'Guardar nota' }).click();
  await expect(
    workspace.getByRole('button', { name: 'Enviar pedido (1)', exact: true }),
  ).toBeInViewport();
});

test('toques rápidos no pierden unidades y conservan separadas las notas y los agregados al recargar', async ({
  page,
}) => {
  const data = await fixture(page, true);
  const table = await createTable(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  const workspace = page.locator('dialog.order-workspace');
  await workspace.getByRole('button', { name: `${data.family} 8 variantes`, exact: true }).click();
  const picker = workspace.getByRole('region', { name: 'Opciones de producto' });
  const jarrito = picker.getByRole('button', { name: 'En jarrito', exact: true });
  await jarrito.evaluate((el) => {
    for (let i = 0; i < 8; i++) (el as HTMLButtonElement).click();
  });
  const lines = workspace.locator('.local-order-items .order-line');
  await expect(lines).toHaveCount(1);
  await expect(lines.first().getByRole('status')).toHaveText('8');
  await lines.first().getByRole('button', { name: 'Nota', exact: true }).click();
  await workspace.getByLabel('Observaciones', { exact: true }).fill('Sin azúcar');
  await workspace.getByRole('button', { name: 'Guardar nota' }).click();
  await jarrito.click();
  await expect(lines).toHaveCount(2);
  await picker.getByRole('checkbox', { name: 'Leche vegetal', exact: true }).check();
  await jarrito.click();
  await expect(lines).toHaveCount(3);
  await page.reload();
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  await expect(lines).toHaveCount(3);
  await expect(lines.filter({ hasText: 'Sin azúcar' }).getByRole('status')).toHaveText('8');
  await expect(lines.filter({ hasText: 'Leche vegetal' })).toHaveCount(1);
  await workspace.getByRole('button', { name: 'Enviar pedido (3)', exact: true }).click();
  await expect(workspace).toHaveCount(0);
  await expect(
    page.getByText(`Mesa ${table.label}: pedido confirmado.`, { exact: true }),
  ).toBeVisible();
  const state = await managementState(page);
  const account = state.accounts.find((a: { table_id: string }) => a.table_id === table.id);
  const saved = state.items.filter((i: { account_id: string }) => i.account_id === account.id);
  expect(saved).toHaveLength(3);
  expect(saved.reduce((total: number, i: { quantity: number }) => total + i.quantity, 0)).toBe(10);
});
