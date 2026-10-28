import { test, expect } from './test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { defaultCategory } from '../../backend/src/modules/catalog-categories';
import { defaultVariation } from '../../backend/src/modules/catalog-variations';
import { chooseSector, createTable, identify, managementState, manager } from './shared-helper';

test('carta completa: cinco principales, 27 subcategorías y variantes, también sin conexión', async ({
  page,
}) => {
  const catalog = JSON.parse(await readFile('backend/catalog/baguette-menu.json', 'utf8'));
  const parents = ['Cafetería', 'Desayunos', 'Cocina', 'Dulces', 'Bebidas'].map((name) => ({
    id: name,
    name,
    parent_id: null,
  }));
  const children = catalog.categories.map((c: { name: string }) => {
    const section = defaultCategory(c.name);
    return { id: section.name, name: section.name, parent_id: section.parent };
  });
  const products = catalog.categories.flatMap(
    (c: { name: string; items: [string, number, string][] }) =>
      c.items.map(([name, price, description]) => ({
        id: name,
        category_id: defaultCategory(c.name).name,
        name,
        description,
        price_cents: price * 100,
        available: true,
        ...defaultVariation(c.name, name),
      })),
  );
  await page.route('**/api/public/menu', (route) =>
    route.fulfill({ json: { categories: [...parents, ...children], products } }),
  );
  await page.goto('/carta');
  const nav = page.getByRole('navigation', { name: 'Categorías de la carta' });
  await expect(nav.getByRole('button')).toHaveCount(6);
  await expect(page.locator('.menu-category')).toHaveCount(5);
  await expect(page.locator('.menu-subcategory')).toHaveCount(27);
  expect(
    (await page.locator('.menu-variations li').count()) +
      (await page.locator('.menu-product:not(.menu-product-family)').count()),
  ).toBe(153);
  await nav.getByRole('button', { name: 'Cafetería', exact: true }).click();
  const subnav = page.getByRole('navigation', { name: 'Subcategorías de Cafetería' });
  await expect(subnav.getByRole('button')).toHaveCount(4);
  await subnav.getByRole('button', { name: 'Cafés clásicos', exact: true }).click();
  await expect(page.locator('.menu-subcategory')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Café', exact: true })).toBeVisible();
  await expect(page.getByText('Con leche', { exact: true })).toBeVisible();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
  }
  await nav.getByRole('button', { name: 'Bebidas', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Subcategorías de Cafetería' })).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Subcategorías de Bebidas' })
    .getByRole('button', { name: 'Cervezas', exact: true })
    .click();
  await expect(page.locator('.menu-subcategory')).toHaveCount(1);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.route('**/api/public/menu', (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByText(/Carta guardada sin conexión/)).toBeVisible();
  await expect(nav.getByRole('button')).toHaveCount(6);
});

test('gestión y comandera: principal → subcategoría → producto → variante, con notas y búsqueda', async ({
  page,
}) => {
  const csrf = await manager(page);
  const tag = Date.now().toString().slice(-7);
  async function save(action: string, data: unknown) {
    const response = await page.request.post(`/api/commands/${action}`, {
      data,
      headers: { 'X-CSRF-Token': csrf, 'Idempotency-Key': randomUUID() },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).result;
  }
  const parent = await save('category.save', { name: `Cafetería ${tag}`, active: true });
  await page.goto('/gestion#catalog');
  await page.getByRole('button', { name: 'Crear categoría', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar categoría' });
  await dialog.getByRole('textbox', { name: 'Nombre', exact: true }).fill(`Clásicos ${tag}`);
  await dialog.getByRole('combobox', { name: 'Categoría principal' }).selectOption(parent.id);
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const state = await managementState(page);
  const child = state.categories.find((c: { name: string }) => c.name === `Clásicos ${tag}`);
  expect(child.parent_id).toBe(parent.id);
  const other = await save('category.save', {
    name: `Tés ${tag}`,
    active: true,
    parent_id: parent.id,
  });
  const base = {
    category_id: child.id,
    name: `Café con leche ${tag}`,
    description: '',
    price_cents: 650000,
    image_url: '',
    destination: 'bar',
    available: true,
    active: true,
    visible_en_carta: true,
    addon_ids: [],
    variant_group: `Café ${tag}`,
    variant_name: 'Con leche',
  };
  await save('product.save', base);
  await save('product.save', { ...base, name: `Café doble ${tag}`, variant_name: 'Doble' });
  await save('product.save', {
    ...base,
    category_id: other.id,
    name: `Té verde ${tag}`,
    variant_group: '',
    variant_name: '',
  });
  const table = await createTable(page);
  await page.goto('/');
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  const workspace = page.locator('dialog.order-workspace');
  const nav = workspace.getByRole('navigation', { name: 'Filtrar productos' });
  await expect(nav.getByRole('button', { name: child.name, exact: true })).toHaveCount(0);
  await nav.getByRole('button', { name: parent.name, exact: true }).click();
  const subnav = workspace.getByRole('navigation', { name: `Subcategorías de ${parent.name}` });
  await subnav.getByRole('button', { name: child.name, exact: true }).click();
  await expect(workspace.locator('.product-tile')).toHaveCount(1);
  await expect(workspace.locator('.product-option').first()).toHaveText(`Café ${tag}`);
  expect((await workspace.locator('.product-tile').first().boundingBox())!.height).toBeLessThan(80);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await workspace.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'test-results/categorias-comandera.png' });
  await workspace.getByRole('button', { name: `Café ${tag} 2 variantes`, exact: true }).click();
  const composer = workspace.getByRole('region', { name: 'Opciones de producto' });
  await composer.getByRole('button', { name: 'Con leche', exact: true }).click();
  await workspace.getByRole('button', { name: 'Nota', exact: true }).click();
  await workspace.getByLabel('Observaciones', { exact: true }).fill('Bien caliente');
  await workspace.getByRole('button', { name: 'Guardar nota' }).click();
  await composer.getByRole('button', { name: 'Volver a productos' }).click();
  await expect(subnav.getByRole('button', { name: child.name })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(workspace.getByText('Bien caliente', { exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Todo', exact: true }).click();
  await workspace.getByRole('searchbox', { name: 'Buscar producto' }).fill(`te verde ${tag}`);
  await expect(workspace.locator('.product-tile')).toHaveCount(1);
  await expect(workspace.locator('.product-category-path')).toHaveCount(0);
  expect(await workspace.innerText()).not.toContain('$');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/categorias-comandera-movil.png' });
});
