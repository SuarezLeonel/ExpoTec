import { test, expect, type Page } from '@playwright/test';
import type { State, Table } from '../../frontend/src/types/index';

async function salon(page: Page, legacy = false, count = 12) {
  const tables: Table[] = Array.from({ length: count }, (_, index) => ({
    id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    label: String(index + 1),
    sector: 'Salón',
    capacity: 4,
    active: true,
    width: 92,
    height: 92,
    shape: index % 2 ? 'square' : 'round',
    x: legacy ? index % 4 : 6000 + (index % 4) * 150,
    y: legacy ? Math.floor(index / 4) : 2000 + Math.floor(index / 4) * 150,
  }));
  const state: State = {
    user: { id: 'terminal', role: 'terminal', name: 'Terminal' },
    permissions: ['terminal_view'],
    tables,
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
  let mutations = 0;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/commands/')) mutations++;
    if (path === '/api/auth/terminal')
      return route.fulfill({ json: { user: state.user, csrf: 'test', mode: 'terminal' } });
    if (path === '/api/state') return route.fulfill({ json: state });
    return route.fulfill({ status: 400, json: { error: { message: 'Unexpected request' } } });
  });
  return { tables, state, mutations: () => mutations };
}

test('el salón ocupa el alto disponible y muestra el sector completo sin scroll en seis tamaños', async ({
  page,
}) => {
  const data = await salon(page);
  await page.goto('/');
  for (const [width, height] of [
    [1440, 900],
    [1519, 639],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('.table-tile')).toHaveCount(12);
    await expect
      .poll(async () =>
        page.locator('.table-tile').evaluateAll((tiles) =>
          tiles.every((tile) => {
            const r = tile.getBoundingClientRect();
            return (
              r.width >= 44 &&
              r.height >= 44 &&
              r.left >= 0 &&
              r.top >= 0 &&
              r.right <= innerWidth &&
              r.bottom <= innerHeight
            );
          }),
        ),
      )
      .toBe(true);
    const metrics = await page.locator('.floor-map-frame').evaluate((frame) => ({
      horizontal: frame.scrollWidth <= frame.clientWidth + 1,
      vertical: frame.scrollHeight <= frame.clientHeight + 1,
      page:
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
      height: frame.clientHeight,
    }));
    expect(metrics).toMatchObject({ horizontal: true, vertical: true, page: true });
    expect(metrics.height).toBeGreaterThan(height * 0.45);
    if (width === 1440 || width === 320)
      await page.screenshot({ path: `test-results/salon-fit-${width}.png` });
  }
  await page.getByRole('button', { name: 'Acercar plano', exact: true }).click();
  await page.getByRole('button', { name: 'Restablecer zoom', exact: true }).click();
  expect(data.mutations()).toBe(0);
  expect(data.tables[0]!.x).toBe(6000);
});

test('mesas con coordenadas antiguas no se superponen en la vista operativa', async ({ page }) => {
  const data = await salon(page, true);
  const original = JSON.stringify(data.tables);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.table-tile')).toHaveCount(12);
  const boxes = await page.locator('.table-tile').evaluateAll((tiles) =>
    tiles.map((tile) => {
      const r = tile.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }),
  );
  for (let i = 0; i < boxes.length; i++)
    for (const b of boxes.slice(i + 1)) {
      const a = boxes[i]!;
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(
        true,
      );
    }
  expect(JSON.stringify(data.tables)).toBe(original);
  expect(data.mutations()).toBe(0);
});

test('el plano operativo muestra sillas publicadas sin convertirlas en mesas', async ({ page }) => {
  const data = await salon(page, false, 1);
  data.state.floorPlan = {
    version: 1,
    published: {
      tables: data.tables.map((table) => ({
        ...table,
        shape: 'round',
        width: 92,
        height: 92,
        rotation: 0,
      })),
      elements: [0, 90, 180, 270].map((rotation, index) => ({
        id: `chair-${index}`,
        kind: 'chair',
        sector: 'Salón',
        x: 6000 + [-36, 32, 100, 32][index]!,
        y: 2000 + [32, -36, 32, 100][index]!,
        width: 28,
        height: 28,
        rotation,
      })),
    },
  };
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await expect(page.locator('.floor-architecture.chair')).toHaveCount(4);
  await expect(page.locator('.physical-table')).toHaveCount(1);
  await expect(page.locator('.physical-table')).toHaveText('1');
  await expect(page.locator('.physical-table .table-chair')).toHaveCount(4);
  await expect(page.locator('.physical-table .tile-bottom')).toHaveCount(0);
  await expect(page.locator('.floor-caption')).toContainText('1 mesas');
  await expect(page.locator('.floor-architecture.chair').nth(1)).toHaveCSS(
    'transform-origin',
    '14px 14px',
  );
  await page.screenshot({ path: 'test-results/salon-chairs.png' });
  expect(data.mutations()).toBe(0);
});

for (const count of [1, 5]) {
  test(`${count} mesas se ven compactas al 100% y al 65%, con numeros legibles`, async ({
    page,
  }) => {
    const data = await salon(page, false, count);
    const original = JSON.stringify(data.tables);
    await page.setViewportSize({ width: 1650, height: 900 });
    await page.goto('/');
    const tiles = page.locator('.physical-table');
    await expect(tiles).toHaveCount(count);
    await expect(page.locator('.floor-zoom')).toContainText('100%');
    await expect.poll(async () => (await tiles.first().boundingBox())!.width).toBeCloseTo(55.2, 1);
    for (const percentage of [100, 65]) {
      if (percentage === 65) {
        for (let click = 0; click < 4; click++)
          await page.getByRole('button', { name: 'Alejar plano', exact: true }).click();
      }
      await expect(page.locator('.floor-zoom')).toContainText(`${percentage}%`);
      const metrics = await tiles.evaluateAll((buttons) =>
        buttons.map((button) => {
          const bounds = button.getBoundingClientRect();
          const number = button.querySelector('strong')!;
          return {
            width: bounds.width,
            height: bounds.height,
            text: (button as HTMLElement).innerText.trim(),
            numberHeight: number.getBoundingClientRect().height,
            title: button.getAttribute('title'),
          };
        }),
      );
      for (const [index, metric] of metrics.entries()) {
        expect(metric.width).toBeCloseTo((55.2 * percentage) / 100, 1);
        expect(metric.height).toBeCloseTo(metric.width, 1);
        expect(metric.text).toBe(String(index + 1));
        expect(metric.numberHeight).toBeGreaterThanOrEqual(16);
        expect(metric.title).toContain('Libre');
      }
      await page.screenshot({ path: `test-results/salon-compact-${count}-${percentage}.png` });
    }
    expect(JSON.stringify(data.tables)).toBe(original);
    expect(data.mutations()).toBe(0);
  });
}
