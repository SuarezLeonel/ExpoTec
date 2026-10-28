import { test, expect, type Page } from './test';
import AxeBuilder from '@axe-core/playwright';
import { chooseSector, createTable, identify } from './shared-helper';
const password = process.env.DEMO_PASSWORD;
if (!password) throw new Error('DEMO_PASSWORD requerido para E2E.');
async function login(page: Page, username = 'admin') {
  await page.goto('/gestion');
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel(/^Contraseña/).fill(password!);
  await page.getByRole('button', { name: 'Iniciar turno' }).click();
  await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
}
test('carta pública comparte catálogo, filtra producto oculto y conserva descarga', async ({
  page,
}) => {
  await page.goto('/carta');
  await expect(page.getByRole('heading', { name: /carta/i }).first()).toBeVisible();
  await expect(page.getByText('Café interno', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Café', exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('list', { name: 'Variantes de Café', exact: true })
      .getByText('Con leche', { exact: true }),
  ).toBeVisible();
  const response = await page.request.post('/api/public/menu/print', { data: {} });
  expect(response.ok()).toBeTruthy();
  const file = await response.json();
  expect(file.id).toBeTruthy();
  expect(Buffer.from(file.content_base64, 'base64').toString()).toContain('Demostración');
});
test('abrir mesa, cargar agregado y observación, enviar y conservar al recargar', async ({
  page,
}) => {
  await login(page);
  const table = await createTable(page);
  const { label } = table;
  await page.reload();
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${label},`) }).click();
  await identify(page, '4101');
  await page.getByLabel('Comensales').fill('2');
  await page.getByRole('button', { name: 'Abrir cuenta', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Tu PIN' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir cuenta', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Café \d+ variante/ }).click();
  const dialog = page.getByRole('region', { name: 'Opciones de producto' });
  await dialog.getByRole('checkbox', { name: /Leche vegetal/ }).check();
  await dialog.getByRole('button', { name: 'Con leche', exact: true }).click();
  await page
    .getByRole('button', { name: 'Sumar una unidad de Café con leche', exact: true })
    .click();
  await page.getByRole('button', { name: 'Nota', exact: true }).click();
  await page.getByLabel('Observaciones').fill('Tibio, prueba de reunión');
  await page.getByRole('button', { name: 'Guardar nota' }).click();
  await expect(page.getByText('Tibio, prueba de reunión', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enviar pedido (1)', exact: true }).click();
  await expect(page.locator('dialog.order-workspace')).toHaveCount(0);
  await expect(page.getByText(`Mesa ${label}: pedido confirmado.`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${label},`) }).click();
  await identify(page, '4101');
  await expect(page.getByRole('button', { name: /^Enviados/ })).toBeVisible();
  await page.reload();
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${label},`) }).click();
  await identify(page, '4101');
  await expect(page.getByText('Tibio, prueba de reunión', { exact: true })).toBeVisible();
  await expect(page.getByText('Leche vegetal', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/salon-desktop.png', fullPage: true });
});
test('escritorio y móvil, temas persistentes y accesibilidad', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const light = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(light.violations).toEqual([]);
  await page.getByRole('button', { name: /oscuro/i }).click();
  await page.reload();
  const dark = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(dark.violations).toEqual([]);
  await page.screenshot({ path: 'test-results/salon-dark.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'El salón' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/salon-mobile.png', fullPage: true });
  const mobile = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(mobile.violations).toEqual([]);
});
