import { test, expect, type Page } from './test';
import { readFile } from 'node:fs/promises';
import type { State } from '../../frontend/src/types';

async function administration(page: Page, permissions = ['manage_catalog', 'manage_users']) {
  const user = {
    id: '50000000-0000-4000-8000-000000000001',
    name: 'Ana Encargada',
    username: 'admin',
    role: 'admin' as const,
    active: true,
  };
  const state: State = {
    user,
    permissions,
    users: [user],
    categories: [],
    products: [],
    addons: [],
    tables: [],
    accounts: [],
    items: [],
    cashSessions: [],
    cashMovements: [],
    payments: [],
    refunds: [],
    discounts: [],
    printJobs: [],
    invoices: [],
    files: [],
  };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session')
      return route.fulfill({ json: { user, csrf: 'test-csrf', mode: 'management' } });
    if (path === '/api/state') return route.fulfill({ json: state });
    if (path === '/api/public/menu')
      return route.fulfill({ json: { categories: state.categories, products: state.products } });
    if (path === '/api/commands/category.save') {
      const body = route.request().postDataJSON() as { id?: string; name: string; active: boolean };
      const result = { ...body, id: body.id || '10000000-0000-4000-8000-000000000001' };
      state.categories = [
        ...state.categories.filter((category) => category.id !== result.id),
        result,
      ];
      return route.fulfill({
        json: { result, operation_id: 'category-test-operation', replayed: false },
      });
    }
    throw new Error(`Solicitud inesperada: ${path}`);
  });
  return state;
}

for (const width of [390, 1440]) {
  test(`crear categorías y administrar usuarios por separado en ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await administration(page);
    await page.goto('/gestion#catalog');
    await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Administrar catálogo' })
        .getByRole('button', { name: 'Usuarios' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Crear categoría', exact: true }).click();
    const create = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Agregar categoría', exact: true }) });
    await create.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Meriendas');
    await create.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(create).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar Meriendas' })).toBeVisible();
    await page.getByRole('button', { name: 'Editar Meriendas' }).click();
    const edit = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Editar categoría', exact: true }) });
    await edit.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Desayunos');
    await edit.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(edit).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar Desayunos' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: `test-results/categories-${width}.png`, fullPage: true });

    if (width < 768) await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
    await page
      .getByRole('complementary', { name: 'Navegación principal' })
      .getByRole('button', { name: 'Usuarios', exact: true })
      .click();
    await expect(page).toHaveURL(/#users$/);
    await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear categoría' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Agregar usuario' })).toBeVisible();
    await page.getByRole('button', { name: 'Editar Ana Encargada' }).click();
    await expect(
      page
        .getByRole('dialog')
        .filter({ has: page.getByRole('heading', { name: 'Editar usuario', exact: true }) })
        .getByLabel('Usuario de acceso'),
    ).toHaveValue('admin');
    await page.getByRole('button', { name: 'Cerrar panel' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/users-${width}.png`, fullPage: true });
  });
}

test('la carta de clientes no enlaza a la operación', async ({ page }) => {
  await administration(page);
  await page.goto('/carta');
  await expect(page.getByRole('heading', { name: 'Nuestra carta' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Operación/i })).toHaveCount(0);
  await expect(page.locator('a[href="/"], a[href^="/gestion"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Carta imprimible' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/customer-menu.png', fullPage: true });
});

test('la carta importada muestra precios y filtra sus variantes en móvil y escritorio', async ({
  page,
}) => {
  const catalog = JSON.parse(
    await readFile(new URL('../../backend/catalog/baguette-menu.json', import.meta.url), 'utf8'),
  ) as {
    categories: { name: string; destination: string; items: [string, number, string][] }[];
  };
  const state = await administration(page);
  state.categories = catalog.categories.map(({ name }, index) => ({
    id: `category-${index}`,
    name,
  }));
  state.products = catalog.categories.flatMap(({ items, destination }, index) =>
    items.map(([name, price, description], item) => ({
      id: `product-${index}-${item}`,
      category_id: `category-${index}`,
      name,
      description,
      price_cents: price * 100,
      destination,
      image_url: null,
      active: true,
      available: true,
      visible_en_carta: true,
      created_at: '2026-10-20T12:00:00Z',
    })),
  );
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/carta');
    await expect(page.locator('.menu-product')).toHaveCount(153);
    await expect(page.getByRole('button', { name: 'Carta imprimible' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Pizzas', exact: true }).click();
    await expect(page.locator('.menu-product')).toHaveCount(8);
    await expect(
      page.locator('.menu-product').filter({ hasText: 'Pizza Margherita chica' }),
    ).toContainText(/\$\s*14\.000,00/);
    await expect(
      page.locator('.menu-product').filter({ hasText: 'Pizza Pedro grande' }),
    ).toContainText(/\$\s*24\.700,00/);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: `test-results/imported-menu-${width}.png`, fullPage: true });
  }
});

for (const permission of ['manage_catalog', 'manage_users']) {
  test(`la navegación respeta el permiso ${permission}`, async ({ page }) => {
    await administration(page, [permission]);
    await page.goto('/gestion#' + (permission === 'manage_users' ? 'catalog' : 'users'));
    const allowed = permission === 'manage_users' ? 'Usuarios' : 'Catálogo';
    const denied = permission === 'manage_users' ? 'Catálogo' : 'Usuarios';
    await expect(page.getByRole('heading', { name: allowed, exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('complementary', { name: 'Navegación principal' })
        .getByRole('button', { name: denied, exact: true }),
    ).toHaveCount(0);
  });
}

for (const width of [390, 1440]) {
  for (const path of ['/carta', '/gestion#catalog']) {
    test(`volver arriba flotante al empezar a bajar en ${path} a ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      if (width === 390) await page.emulateMedia({ reducedMotion: 'reduce' });
      const state = await administration(page);
      state.categories = [{ id: 'category-test', name: 'Cafetería', active: true }];
      state.products = Array.from({ length: 40 }, (_, index) => ({
        id: `product-${index}`,
        name: `Café ${index + 1}`,
        description: 'Café de prueba',
        category_id: 'category-test',
        price_cents: 200000,
        image_url: null,
        destination: 'bar',
        available: true,
        active: true,
        visible_en_carta: true,
        created_at: '2026-10-20T12:00:00Z',
      }));
      await page.goto(path);
      await expect(page.getByText('Café 1', { exact: true })).toBeVisible();
      const button = page.getByRole('button', { name: 'Volver arriba', exact: true });
      await expect(button).toHaveCount(0);
      await page.evaluate(() => window.scrollTo({ top: 96, behavior: 'instant' }));
      await expect(button).toBeInViewport();
      const initial = await button.boundingBox();
      expect(initial).not.toBeNull();
      expect(initial!.width).toBe(initial!.height);
      await expect(button).toHaveCSS('border-radius', '50%');
      expect(
        await page.evaluate(() => scrollY + innerHeight < document.documentElement.scrollHeight),
      ).toBeTruthy();
      await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
      await expect(button).toBeInViewport();
      expect((await button.boundingBox())!.y).toBe(initial!.y);
      await page.screenshot({
        path: `test-results/scroll-top-${path.startsWith('/carta') ? 'menu' : 'management'}-${width}.png`,
      });
      await button.focus();
      await page.keyboard.press('Enter');
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
      await expect(button).toHaveCount(0);
    });
  }
}
