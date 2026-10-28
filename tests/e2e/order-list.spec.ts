import { test, expect } from './test';
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

test('listado de comanda: varias cargas, notas, cantidades y enviados ocupan su lugar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 870, height: 668 });
  const csrf = await manager(page);
  const state = await managementState(page);
  const longName = `Tostado de jamón y queso en pan integral con tomates asados ${Date.now().toString().slice(-6)}`;
  const created = await page.request.post('/api/commands/product.save', {
    headers: { 'X-CSRF-Token': csrf, 'Idempotency-Key': randomUUID() },
    data: {
      name: longName,
      description: '',
      category_id: state.categories[0].id,
      price_cents: 1234500,
      image_url: '',
      destination: 'kitchen',
      available: true,
      active: true,
      visible_en_carta: true,
      addon_ids: [],
      variant_group: '',
      variant_name: '',
    },
  });
  expect(created.ok()).toBeTruthy();
  const table = await createTable(page, 'Salón');
  await page.goto('/');
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  const workspace = page.locator('dialog.order-workspace');
  for (let count = 0; count < 4; count++) {
    await workspace.getByRole('button', { name: 'Agregar 1 Medialuna', exact: true }).click();
    await expect(workspace.getByLabel('Cantidad de Medialuna', { exact: true })).toHaveText(
      String(count + 1),
    );
  }
  for (let count = 0; count < 2; count++) {
    await workspace.getByRole('button', { name: 'Agregar 1 Limonada', exact: true }).click();
    await expect(workspace.getByLabel('Cantidad de Limonada', { exact: true })).toHaveText(
      String(count + 1),
    );
  }
  const list = workspace.locator('.local-order-items');
  await expect(list.locator('.account-item')).toHaveCount(2);
  const newest = list.locator('.account-item').first();
  await expect(workspace).not.toContainText('$');
  expect((await newest.boundingBox())!.height).toBeLessThan(70);
  expect(
    await newest
      .locator('.order-line-title')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(15);
  await expect(newest.locator('.order-line-title')).toHaveText('Limonada');
  await expect(newest.getByLabel('Cantidad de Limonada', { exact: true })).toHaveText('2');
  await expect(
    newest.getByRole('button', { name: 'Restar una unidad de Limonada', exact: true }),
  ).toBeEnabled();
  await newest.getByRole('button', { name: 'Nota', exact: true }).click();
  await expect(newest.getByLabel('Observaciones', { exact: true })).toBeFocused();
  await newest
    .getByLabel('Observaciones', { exact: true })
    .fill('Sin hielo. Servir con un vaso adicional para compartir.');
  await newest.getByRole('button', { name: 'Guardar nota', exact: true }).click();
  await newest.getByRole('button', { name: 'Sumar una unidad de Limonada', exact: true }).click();
  await expect(newest.getByLabel('Cantidad de Limonada', { exact: true })).toHaveText('3');
  await newest.getByRole('button', { name: 'Restar una unidad de Limonada', exact: true }).click();
  await expect(newest.getByLabel('Cantidad de Limonada', { exact: true })).toHaveText('2');
  await expect(
    newest.getByRole('button', { name: 'Restar una unidad de Limonada', exact: true }),
  ).toBeEnabled();
  await newest.getByRole('button', { name: 'Sumar una unidad de Limonada', exact: true }).click();
  await expect(newest.getByLabel('Cantidad de Limonada', { exact: true })).toHaveText('3');
  await expect(
    newest.getByText('Sin hielo. Servir con un vaso adicional para compartir.', { exact: true }),
  ).toBeVisible();
  await expect(workspace.getByText(/7 para enviar/)).toBeVisible();
  await newest.getByRole('button', { name: 'Acciones de Limonada', exact: true }).press('Enter');
  await newest.getByRole('button', { name: 'Corregir', exact: true }).click();
  const correction = newest.getByRole('form');
  await expect(correction.getByLabel(/^Cantidad/)).toHaveValue('3');
  await correction.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(list.getByRole('checkbox')).toHaveCount(0);
  await workspace.getByRole('searchbox', { name: 'Buscar producto', exact: true }).fill(longName);
  await workspace.getByRole('button', { name: `Agregar 1 ${longName}`, exact: true }).click();
  await expect(
    list.locator('.account-item').first().getByText(longName, { exact: true }),
  ).toBeVisible();
  await expect(
    workspace.getByRole('button', { name: 'Enviar pedido (3)', exact: true }),
  ).toBeInViewport();
  await workspace.getByRole('button', { name: 'Enviar pedido (3)', exact: true }).click();
  await reopenAfterSend(page, table.label);
  await expect(workspace.getByRole('button', { name: /^Pendientes/ })).toHaveCount(0);
  const sentList = workspace.getByRole('region', { name: 'Productos del pedido' });
  await expect(sentList.locator('.sent-order-items .account-item')).toHaveCount(3);
  await expect(sentList.locator('.sent-order-items .order-line-stepper')).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Seleccionar productos', exact: true }).click();
  await expect(sentList.getByRole('checkbox')).toHaveCount(3);
  await workspace.getByRole('button', { name: 'Terminar selección', exact: true }).click();
  await workspace.getByRole('searchbox', { name: 'Buscar producto', exact: true }).fill('');
  await workspace.getByRole('button', { name: 'Agregar 1 Medialuna', exact: true }).click();
  await expect(list.locator('.account-item')).toHaveCount(1);
  await expect(sentList.locator('.sent-order-items .account-item')).toHaveCount(3);
  await workspace.getByRole('button', { name: 'Opciones de cuenta', exact: true }).click();
  await expect(
    workspace.getByRole('button', { name: 'Enviar pedido (1)', exact: true }),
  ).toBeInViewport();
  await expect(
    workspace.getByRole('button', { name: 'Solicitar cuenta', exact: true }),
  ).toBeInViewport();
  await workspace.getByRole('button', { name: 'Opciones de cuenta', exact: true }).click();
  await page.screenshot({ path: 'test-results/pedido-listado-tablet.png' });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    if (width <= 800)
      await workspace.getByRole('button', { name: 'Pedido (9)', exact: true }).click();
    await expect(
      workspace.getByRole('button', { name: 'Enviar pedido (1)', exact: true }),
    ).toBeInViewport();
    expect(
      await workspace.evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBeTruthy();
    expect(
      await list.evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBeTruthy();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await workspace.getByRole('button', { name: 'Pedido (9)', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/pedido-listado-movil.png' });
  const final = await managementState(page);
  const saved = final.items.filter(
    (item: { account_id: string }) =>
      item.account_id ===
      final.accounts.find((account: { table_id: string }) => account.table_id === table.id).id,
  );
  expect(saved.filter((i: { status: string }) => i.status === 'sent')).toHaveLength(3);
  expect(saved.filter((i: { status: string }) => i.status === 'draft')).toHaveLength(0);
  await expect(list.locator('.account-item')).toHaveCount(1);
});
