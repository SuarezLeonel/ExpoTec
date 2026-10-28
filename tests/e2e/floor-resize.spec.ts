import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { FloorLayout, State } from '../../frontend/src/types';

async function editor(
  page: Page,
  rotation = 0,
  shape: 'round' | 'square' | 'rectangular' = 'round',
) {
  const user = {
    id: '50000000-0000-4000-8000-000000000001',
    name: 'Encargada',
    role: 'admin',
    active: true,
  };
  const layout: FloorLayout = {
    tables: [
      {
        id: '40000000-0000-4000-8000-000000000001',
        label: '1',
        sector: 'Salón',
        x: 120,
        y: 120,
        width: 64,
        height: 64,
        rotation,
        shape,
        capacity: 4,
        active: true,
      },
    ],
    elements: [
      {
        id: '40000000-0000-4000-8000-000000000002',
        kind: 'separator',
        sector: 'Salón',
        x: 300,
        y: 200,
        width: 90,
        height: 24,
        rotation,
      },
    ],
  };
  const state: State = {
    user,
    permissions: ['manage_tables'],
    users: [user],
    tables: layout.tables,
    floorPlan: { published: structuredClone(layout), version: 1 },
    floorPlanDraft: { draft: layout, draft_revision: 1, version: 1 },
    accounts: [],
    items: [],
    categories: [],
    products: [],
    addons: [],
    cashSessions: [],
    cashMovements: [],
    payments: [],
    refunds: [],
    discounts: [],
    printJobs: [],
    invoices: [],
    files: [],
  };
  const saved: FloorLayout[] = [];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/session')
      return route.fulfill({ json: { user, csrf: 'test', mode: 'management' } });
    if (path === '/api/state') return route.fulfill({ json: state });
    if (path === '/api/commands/floor-plan.draft.save') {
      const data = route.request().postDataJSON();
      saved.push(data.layout);
      state.floorPlanDraft = { draft: data.layout, draft_revision: saved.length + 1, version: 1 };
      return route.fulfill({
        json: {
          result: { draft_revision: saved.length + 1, version: 1 },
          operation_id: `save-${saved.length}`,
          replayed: false,
        },
      });
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/gestion#design');
  await expect(page.locator('.editor-canvas')).toBeVisible();
  await page.getByLabel('Ajustar a cuadrícula', { exact: true }).uncheck();
  return { saved, state };
}

async function dimensions(page: Page, selector = '.plan-table') {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => ({
      x: parseFloat((el as HTMLElement).style.left),
      y: parseFloat((el as HTMLElement).style.top),
      width: parseFloat((el as HTMLElement).style.width),
      height: parseFloat((el as HTMLElement).style.height),
    }));
}

async function resize(page: Page, handle: string, x: number, y: number, finish = true) {
  const control = page.getByRole('button', { name: `Cambiar tamaño desde ${handle}`, exact: true });
  const box = (await control.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + x, box.y + box.height / 2 + y, { steps: 5 });
  if (finish) await page.mouse.up();
}

async function placeOnCanvas(page: Page, x: number, y: number) {
  const canvas = (await page.locator('.editor-canvas').boundingBox())!;
  await page.mouse.click(canvas.x + x, canvas.y + y);
}

test('las herramientas quedan arriba y las sillas indican capacidad sin texto sobre las mesas', async ({
  page,
}) => {
  await editor(page);
  for (const width of [1440, 1024, 768, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const tools = (await page
      .getByRole('complementary', { name: 'Herramientas', exact: true })
      .boundingBox())!;
    const canvas = (await page.locator('.editor-canvas-viewport').boundingBox())!;
    expect(tools.y + tools.height).toBeLessThanOrEqual(canvas.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const table = page.getByRole('button', { name: 'Mesa 1', exact: true });
  await expect(table).toHaveText('1');
  await expect(table.locator('.table-chair')).toHaveCount(4);
  await table.click();
  await expect(page.locator('.floor-resize-edge')).toHaveCount(0);
  await page.getByRole('spinbutton', { name: 'Capacidad', exact: true }).fill('6');
  await expect(table.locator('.table-chair')).toHaveCount(6);
  await expect(table).toHaveText('1');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/floor-editor-restored.png', fullPage: true });
});

test('cada icono permite elegir la ubicación sin mover las mesas que ya estaban', async ({
  page,
}) => {
  const { saved } = await editor(page);
  const original = await dimensions(page);
  const entries = [
    ['Agregar mesa', '.plan-table.round'],
    ['Mesa cuadrada', '.plan-table.square'],
    ['Mesa rectangular', '.plan-table.rectangular'],
    ['Agregar pared', '.plan-architect.wall'],
  ] as const;
  for (const [index, [name, selector]] of entries.entries()) {
    const icon = page.getByRole('button', { name, exact: true });
    expect(await icon.evaluate((el) => el.tagName)).toBe('BUTTON');
    const before = await page.locator(selector).count();
    await icon.click();
    await expect(icon).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(selector)).toHaveCount(before);
    const x = 240 + index * 56;
    const y = 64 + index * 48;
    await placeOnCanvas(page, x, y);
    await expect(page.locator(selector)).toHaveCount(before + 1);
    await expect(icon).toHaveAttribute('aria-pressed', 'false');
    expect(
      await page
        .locator(selector)
        .last()
        .evaluate((el) => ({
          x: parseFloat((el as HTMLElement).style.left),
          y: parseFloat((el as HTMLElement).style.top),
        })),
    ).toEqual({ x: Math.round(x / 0.8), y: Math.round(y / 0.8) });
    expect(await dimensions(page)).toEqual(original);
  }
  await expect(page.getByRole('button', { name: 'Seleccionar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Agregar puerta', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Separador', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Agregar silla', exact: true })).toHaveCount(0);
  expect(saved).toHaveLength(0);
});

test('la colocación con teclado respeta zoom y desplazamiento del plano', async ({ page }) => {
  await editor(page);
  await page.getByRole('button', { name: 'Acercar', exact: true }).click();
  await page.getByLabel('Ajustar a cuadrícula', { exact: true }).check();
  await page.locator('.editor-canvas-viewport').evaluate((el) => {
    el.scrollLeft = 200;
  });
  const icon = page.getByRole('button', { name: 'Mesa cuadrada', exact: true });
  await icon.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Plano del salón', exact: true })).toBeFocused();
  const before = await dimensions(page, '.floor-placement-preview');
  await page.mouse.move(5, 5);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.plan-table.square')).toHaveCount(1);
  expect(await dimensions(page, '.plan-table.square')).toEqual({
    ...before,
    x: before.x + 20,
    y: before.y + 20,
  });
  await expect(page.locator('.floor-placement-preview')).toHaveCount(0);
});

test('Escape cancela el arrastre y la colocación pendiente sin crear objetos', async ({ page }) => {
  await editor(page);
  const icon = page.getByRole('button', { name: 'Mesa rectangular', exact: true });
  const box = (await icon.boundingBox())!;
  const canvas = (await page.locator('.editor-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 240, canvas.y + 80, { steps: 6 });
  await expect(page.locator('.palette-ghost')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.palette-ghost')).toHaveCount(0);
  await expect(page.locator('.plan-table')).toHaveCount(1);
  await placeOnCanvas(page, 240, 80);
  await expect(page.locator('.plan-table')).toHaveCount(1);
  await icon.focus();
  await page.keyboard.press('Enter');
  await expect(icon).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(icon).toHaveAttribute('aria-pressed', 'false');
  await placeOnCanvas(page, 240, 80);
  await expect(page.locator('.plan-table')).toHaveCount(1);
});

test('eliminar respeta la selección visible y permite cancelar, deshacer y rehacer', async ({
  page,
}) => {
  await editor(page);
  const remove = page.getByRole('button', { name: 'Eliminar seleccionado', exact: true });
  const undo = page.getByRole('button', { name: 'Deshacer', exact: true });
  const redo = page.getByRole('button', { name: 'Rehacer', exact: true });
  await expect(remove).toBeDisabled();
  await page.getByRole('button', { name: 'Mesa cuadrada', exact: true }).click();
  await placeOnCanvas(page, 240, 80);
  await expect(remove).toBeEnabled();
  await undo.click();
  await expect(page.locator('.plan-table')).toHaveCount(1);
  await expect(remove).toBeDisabled();
  await expect(page.locator('.floor-resize-handle')).toHaveCount(0);
  await redo.click();
  await page.getByRole('button', { name: 'Mesa 2', exact: true }).click();
  await remove.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('.plan-table')).toHaveCount(2);
  await remove.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.plan-table')).toHaveCount(1);
  await expect(remove).toBeDisabled();
  await undo.click();
  await expect(page.locator('.plan-table')).toHaveCount(2);
  await redo.click();
  await expect(page.locator('.plan-table')).toHaveCount(1);
  await page.getByRole('button', { name: 'Mesa 1', exact: true }).click();
  await expect(remove).toBeEnabled();
  await page.getByRole('combobox', { name: 'Sector del plano', exact: true }).selectOption('Patio');
  await expect(remove).toBeDisabled();
  await expect(page.locator('.floor-resize-handle')).toHaveCount(0);
  await expect(page.locator('.plan-table')).toHaveCount(0);
});

test('en celular chico se puede tocar un icono, desplazar la página y colocar en el plano', async ({
  page,
}) => {
  await editor(page);
  await page.setViewportSize({ width: 390, height: 700 });
  const icon = page.getByRole('button', { name: 'Mesa cuadrada', exact: true });
  await icon.scrollIntoViewIfNeeded();
  const box = (await icon.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  const tap = async (x: number, y: number) => {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(icon).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.plan-table')).toHaveCount(1);
  await page
    .locator('.editor-canvas-viewport')
    .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  const canvas = (await page.locator('.editor-canvas').boundingBox())!;
  const viewport = (await page.locator('.editor-canvas-viewport').boundingBox())!;
  const x = Math.max(canvas.x, viewport.x) + 48;
  const y = Math.max(canvas.y, viewport.y, 80) + 24;
  await tap(x, y);
  await client.detach();
  const table = page.getByRole('button', { name: 'Mesa 2', exact: true });
  await expect(table).toBeVisible();
  expect(
    await table.evaluate((el) => ({
      x: parseFloat((el as HTMLElement).style.left),
      y: parseFloat((el as HTMLElement).style.top),
    })),
  ).toEqual({ x: Math.round((x - canvas.x) / 0.8), y: Math.round((y - canvas.y) / 0.8) });
  await expect(icon).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.palette-ghost')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/floor-palette-small-mobile.png', fullPage: true });
});

test('la paleta permite arrastrar formas y elementos, y soltar fuera no crea objetos', async ({
  page,
}) => {
  const { saved } = await editor(page);
  const canvas = (await page.locator('.editor-canvas').boundingBox())!;
  const drop = async (name: string, dx: number, dy: number) => {
    const icon = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    await page.mouse.move(icon.x + icon.width / 2, icon.y + icon.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvas.x + dx, canvas.y + dy, { steps: 8 });
    await expect(page.locator('.palette-ghost')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('.palette-ghost')).toHaveCount(0);
  };
  await drop('Mesa cuadrada', 160, 80);
  await expect(page.locator('.plan-table.square')).toHaveCount(1);
  expect(
    await page
      .getByRole('button', { name: 'Mesa 2', exact: true })
      .evaluate((el) => ({ x: (el as HTMLElement).style.left, y: (el as HTMLElement).style.top })),
  ).toEqual({ x: '200px', y: '100px' });
  await drop('Mesa rectangular', 240, 160);
  await expect(page.locator('.plan-table.rectangular')).toHaveCount(1);
  for (const [name, kind] of [['Agregar pared', 'wall']]) {
    const before = await page.locator(`.plan-architect.${kind}`).count();
    await drop(name, 320, 200);
    await expect(page.locator(`.plan-architect.${kind}`)).toHaveCount(before + 1);
  }
  const icon = (await page
    .getByRole('button', { name: 'Agregar mesa', exact: true })
    .boundingBox())!;
  await page.mouse.move(icon.x + 10, icon.y + 10);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.plan-table')).toHaveCount(3);
  expect(saved).toHaveLength(0);
  await page.screenshot({ path: 'test-results/floor-palette.png', fullPage: true });
});

test('la paleta permite arrastrar una mesa con el dedo en celular', async ({ page }) => {
  await editor(page);
  await page.setViewportSize({ width: 390, height: 1100 });
  const icon = (await page
    .getByRole('button', { name: 'Mesa cuadrada', exact: true })
    .boundingBox())!;
  const canvas = (await page.locator('.editor-canvas').boundingBox())!;
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: icon.x + icon.width / 2, y: icon.y + icon.height / 2 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: canvas.x + 96, y: canvas.y + 80 }],
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
  await expect(page.locator('.plan-table.square')).toHaveCount(1);
  await expect(page.locator('.palette-ghost')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/floor-palette-mobile.png', fullPage: true });
});

test('mesas redondas: las esquinas mantienen la proporcion, se deshacen y se guardan', async ({
  page,
}) => {
  const { saved, state } = await editor(page);
  const table = page.getByRole('button', { name: 'Mesa 1', exact: true });
  await expect(table).toHaveText('1');
  expect((await table.boundingBox())!.width).toBeLessThan(60);
  await table.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.floor-resize-handle')).toHaveCount(4);
  await expect(page.locator('.floor-resize-edge')).toHaveCount(0);
  for (const name of ['Ancho', 'Alto', 'Longitud'])
    await expect(page.getByLabel(name, { exact: true })).toHaveCount(0);
  const original = await dimensions(page);
  await resize(page, 'esquina inferior derecha', 80, 40);
  const expanded = await dimensions(page);
  expect(expanded).toEqual({ ...original, width: 164, height: 164 });
  expect(saved).toHaveLength(0);
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  expect(await dimensions(page)).toEqual(original);
  await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click();
  expect(await dimensions(page)).toEqual(expanded);
  await resize(page, 'esquina superior izquierda', 16, 0);
  expect(await dimensions(page)).toEqual({ x: 140, y: 140, width: 144, height: 144 });
  const beforeCancel = await dimensions(page);
  await resize(page, 'esquina inferior derecha', 32, 32, false);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await dimensions(page)).toEqual(beforeCancel);
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(page.getByText('Borrador guardado.', { exact: true })).toBeVisible();
  expect(saved).toHaveLength(1);
  expect(saved[0]!.tables[0]).toMatchObject({ ...beforeCancel, capacity: 4 });
  expect(state.floorPlan!.published.tables[0]!.width).toBe(64);
  await page.reload();
  await expect(page.locator('.plan-table')).toBeVisible();
  expect(await dimensions(page)).toEqual(beforeCancel);
  await page.getByRole('button', { name: 'Mesa 1', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/floor-resize-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await expect(page.locator('.floor-resize-handle')).toHaveCount(0);
});

test('las sillas automaticas se guardan con la capacidad sin herramientas para sillas sueltas', async ({
  page,
}) => {
  const { saved } = await editor(page);
  const table = page.getByRole('button', { name: 'Mesa 1', exact: true });
  await expect(page.getByRole('button', { name: 'Agregar silla', exact: true })).toHaveCount(0);
  await table.click();
  await page.getByRole('spinbutton', { name: 'Capacidad', exact: true }).fill('6');
  await expect(table.locator('.table-chair')).toHaveCount(6);
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(table.locator('.table-chair')).toHaveCount(4);
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click();
  await expect(table.locator('.table-chair')).toHaveCount(6);
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(page.getByText('Borrador guardado.', { exact: true })).toBeVisible();
  expect(saved[0]!.tables[0]!.capacity).toBe(6);
  expect(saved[0]!.elements.filter((element) => element.kind === 'chair')).toHaveLength(0);
  await page.reload();
  await expect(table.locator('.table-chair')).toHaveCount(6);
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await expect(table).toHaveText('1');
  await expect(table.locator('.table-chair')).toHaveCount(6);
  await expect(page.locator('.floor-resize-handle')).toHaveCount(0);
});

test('las mesas cuadradas mantienen ambos lados iguales al arrastrar y usar el teclado', async ({
  page,
}) => {
  await editor(page, 0, 'square');
  await page.getByRole('button', { name: 'Mesa 1', exact: true }).click();
  await expect(page.locator('.floor-resize-handle')).toHaveCount(4);
  await resize(page, 'esquina inferior derecha', 8, 40);
  expect(await dimensions(page)).toEqual({ x: 120, y: 120, width: 114, height: 114 });
  await resize(page, 'esquina superior izquierda', 24, 8);
  expect(await dimensions(page)).toEqual({ x: 150, y: 150, width: 84, height: 84 });
  await page
    .getByRole('button', { name: 'Cambiar tamaño desde esquina inferior derecha', exact: true })
    .press('ArrowRight');
  expect(await dimensions(page)).toEqual({ x: 150, y: 150, width: 94, height: 94 });
  await page.screenshot({ path: 'test-results/floor-resize-square.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Forma', exact: true }).selectOption('rectangular');
  await expect(page.locator('.floor-resize-handle')).toHaveCount(8);
  await resize(page, 'borde derecho', 32, 0);
  const rectangle = await dimensions(page);
  expect(rectangle.width).toBe(136);
  expect(rectangle.height).toBe(56);
  await page.getByRole('combobox', { name: 'Forma', exact: true }).selectOption('round');
  await expect(page.locator('.floor-resize-handle')).toHaveCount(4);
  expect(await dimensions(page)).toMatchObject({ width: 136, height: 136 });
});

test('las mesas rectangulares se redimensionan desde todo el borde y desde las esquinas', async ({
  page,
}) => {
  await editor(page, 0, 'rectangular');
  await page.getByRole('button', { name: 'Mesa 1', exact: true }).click();
  await expect(page.locator('.floor-resize-handle')).toHaveCount(8);
  await resize(page, 'esquina inferior derecha', 80, 40);
  expect(await dimensions(page)).toEqual({ x: 120, y: 120, width: 164, height: 114 });
  for (const [handle, dx, dy, expected] of [
    ['borde superior', 0, -16, { x: 120, y: 100, width: 164, height: 134 }],
    ['borde derecho', 16, 0, { x: 120, y: 120, width: 184, height: 114 }],
    ['borde inferior', 0, 16, { x: 120, y: 120, width: 164, height: 134 }],
    ['borde izquierdo', -16, 0, { x: 100, y: 120, width: 184, height: 114 }],
  ] as const) {
    const control = page.getByRole('button', {
      name: `Cambiar tamaño desde ${handle}`,
      exact: true,
    });
    const box = (await control.boundingBox())!;
    // Grab away from the midpoint to exercise the full edge hit area.
    const x = box.x + box.width * (dx ? 0.5 : 0.25);
    const y = box.y + box.height * (dy ? 0.5 : 0.25);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 5 });
    await page.mouse.up();
    expect(await dimensions(page)).toEqual(expected);
    await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  }
  await page.screenshot({ path: 'test-results/floor-resize-rectangle.png', fullPage: true });
});

test('el redimensionado respeta rotación, zoom, cuadrícula y elementos con origen de giro izquierdo', async ({
  page,
}) => {
  await editor(page, 90, 'rectangular');
  await page.getByRole('button', { name: 'Mesa 1', exact: true }).click();
  await resize(page, 'borde derecho', 0, 32);
  expect(await dimensions(page)).toEqual({ x: 100, y: 140, width: 104, height: 64 });
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await page.getByLabel('Ajustar a cuadrícula', { exact: true }).check();
  await resize(page, 'borde derecho', 0, 23);
  expect((await dimensions(page)).width).toBe(84);
  await page.getByRole('button', { name: 'separator', exact: true }).click();
  const element = await dimensions(page, '.plan-architect');
  await resize(page, 'borde derecho', 0, 32);
  expect(await dimensions(page, '.plan-architect')).toEqual({
    ...element,
    width: element.width + 40,
  });
  await page
    .getByRole('button', { name: 'Cambiar tamaño desde borde inferior', exact: true })
    .press('ArrowDown');
  expect((await dimensions(page, '.plan-architect')).height).toBe(element.height + 10);
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  expect((await dimensions(page, '.plan-architect')).height).toBe(element.height);
});

test('se pueden arrastrar tiradores en pantalla táctil y las mesas nuevas nacen compactas', async ({
  page,
}) => {
  await editor(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Agregar mesa', exact: true }).click();
  await page.locator('.editor-canvas-viewport').scrollIntoViewIfNeeded();
  const canvas = (await page.locator('.editor-canvas').boundingBox())!;
  await page.mouse.click(canvas.x + 48, Math.max(canvas.y, 80) + 24);
  const table = page.getByRole('button', { name: 'Mesa 2', exact: true });
  await expect(table).toHaveText('2');
  expect((await table.boundingBox())!.width).toBeLessThan(60);
  const handle = page.getByRole('button', {
    name: 'Cambiar tamaño desde esquina inferior derecha',
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + 32, y: y + 16 }],
  });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
  expect(
    await table.evaluate((el) => ({
      width: parseFloat((el as HTMLElement).style.width),
      height: parseFloat((el as HTMLElement).style.height),
    })),
  ).toEqual({ width: 104, height: 104 });
  await page.screenshot({ path: 'test-results/floor-resize-mobile.png', fullPage: true });
});
