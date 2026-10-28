import { test, expect } from './test';
import AxeBuilder from '@axe-core/playwright';
import { chooseSector, createTable, identify } from './shared-helper';

for (const [width, height] of [
  [390, 844],
  [1440, 900],
]) {
  test(`formularios, búsqueda recuperable y agregados accesibles en ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/gestion');
    await page.getByRole('button', { name: 'Iniciar turno' }).click();
    await expect(page.getByLabel(/^Usuario/)).toBeFocused();
    await expect(page.getByLabel(/^Usuario/)).toHaveAttribute('aria-invalid', 'true');
    await page.screenshot({ path: `test-results/login-validation-${width}.png`, fullPage: true });
    await page.getByLabel(/^Usuario/).fill('admin');
    await page.getByLabel(/^Contraseña/).fill(process.env.DEMO_PASSWORD!);
    await page.getByRole('button', { name: 'Iniciar turno' }).click();
    await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
    await page.goto('/gestion#catalog');
    const search = page.getByRole('searchbox', { name: 'Buscar en productos' });
    await search.fill('producto inexistente de revisión');
    await expect(page.getByRole('button', { name: 'Limpiar búsqueda' })).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: `test-results/catalog-empty-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
    await expect(search).toHaveValue('');
    await expect(
      page.getByRole('button', { name: 'Editar Café con leche', exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);

    const table = await createTable(page, `Usabilidad ${width}`);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
    await chooseSector(page, table.sector);
    await page.screenshot({ path: `test-results/terminal-${width}.png`, fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
    await identify(page);
    await page.getByRole('button', { name: /^Café \d+ variante/ }).click();
    const picker = page.getByRole('region', { name: 'Opciones de producto' });
    const addon = picker.getByRole('checkbox', { name: /Leche vegetal/ });
    await addon.check();
    await expect(addon).toBeChecked();
    await addon.focus();
    await page.keyboard.press('Space');
    await expect(addon).not.toBeChecked();
    await page.keyboard.press('Space');
    await expect(addon).toBeChecked();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: `test-results/addons-${width}.png`, fullPage: true });
    await picker.getByRole('button', { name: 'Con leche', exact: true }).click();
    await picker.getByRole('button', { name: 'Con leche', exact: true }).click();
    await expect(picker).toBeVisible();
    if (width < 768) await page.getByRole('button', { name: 'Pedido (2)', exact: true }).click();
    await expect(
      page.locator('.order-pane').getByText('Leche vegetal', { exact: true }),
    ).toBeVisible();
  });
}
