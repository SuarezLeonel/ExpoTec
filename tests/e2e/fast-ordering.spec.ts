import { test, expect } from './test';
import AxeBuilder from '@axe-core/playwright';
import { chooseSector, closeTable, createTable, identify, managementState } from './shared-helper';

test('cualquier producto sin variantes se carga tocando su nombre y los toques repetidos suman localmente', async ({
  page,
}) => {
  const table = await createTable(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  const workspace = page.locator('dialog.order-workspace');
  const commands: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/commands/')) commands.push(request.url());
  });
  for (const name of ['Medialuna', 'Limonada']) {
    const product = workspace.getByRole('button', { name, exact: true });
    await product.click();
    await product.evaluate((el) => {
      for (let i = 0; i < 3; i++) (el as HTMLButtonElement).click();
    });
    await expect(workspace.getByLabel(`Cantidad de ${name}`, { exact: true })).toHaveText('4');
  }
  await expect(workspace.locator('.local-order-items .order-line')).toHaveCount(2);
  await expect(workspace.getByRole('region', { name: 'Opciones de producto' })).toHaveCount(0);
  await expect(workspace.getByLabel('Observaciones', { exact: true })).toHaveCount(0);
  expect(commands).toEqual([]);
});

test('el borrador sin enviar conserva productos, notas y comensales al recargar, con movimiento reducido', async ({
  page,
}) => {
  const table = await createTable(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  const workspace = page.locator('dialog.order-workspace');
  await workspace.getByLabel('Comensales', { exact: true }).fill('3');
  await workspace.getByRole('button', { name: 'Agregar 1 Medialuna' }).click();
  await workspace.getByRole('button', { name: 'Nota', exact: true }).click();
  await workspace.getByLabel('Observaciones', { exact: true }).fill('Sin enviar todavía');
  await workspace.getByRole('button', { name: 'Guardar nota' }).click();
  expect(await workspace.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await page.reload();
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  await expect(workspace.getByLabel('Comensales', { exact: true })).toHaveValue('3');
  await expect(workspace.getByLabel('Cantidad de Medialuna', { exact: true })).toHaveText('1');
  await expect(workspace.getByText('Sin enviar todavía', { exact: true })).toBeVisible();
  const data = await managementState(page);
  expect(data.accounts.some((a: { table_id: string }) => a.table_id === table.id)).toBe(false);
});

test('carga local inmediata, cierre al enviar y cambio seguro de empleado', async ({ page }) => {
  const table = await createTable(page);
  const before = await managementState(page);
  const commands: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/commands/')) commands.push(request.url());
  });
  await page.goto('/');
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  let stateRequests = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/state') stateRequests++;
  });
  await identify(page);
  expect(stateRequests).toBe(0);
  const workspace = page.locator('dialog.order-workspace');
  const latency = await workspace
    .getByRole('button', { name: 'Agregar 1 Medialuna' })
    .evaluate(async (element) => {
      const start = performance.now();
      (element as HTMLButtonElement).click();
      await new Promise(requestAnimationFrame);
      return performance.now() - start;
    });
  expect(latency).toBeLessThan(300);
  await expect(workspace.getByLabel('Cantidad de Medialuna', { exact: true })).toHaveText('1');
  await workspace.getByRole('button', { name: 'Sumar una unidad de Medialuna' }).click();
  await expect(workspace.getByLabel('Cantidad de Medialuna', { exact: true })).toHaveText('2');
  await workspace.getByRole('button', { name: 'Nota', exact: true }).click();
  await workspace.getByLabel('Observaciones', { exact: true }).fill('Pedido local rápido');
  await workspace.getByRole('button', { name: 'Guardar nota' }).click();
  expect(commands).toEqual([]);
  expect((await managementState(page)).items.length).toBe(before.items.length);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let committed = false;
  let releaseBeforeCommit!: () => void;
  const requestGate = new Promise<void>((resolve) => {
    releaseBeforeCommit = resolve;
  });
  let releasedGrant = false;
  await page.route('**/api/auth/operator-release', async (route) => {
    releasedGrant = true;
    await route.continue();
  });
  await page.route('**/api/commands/order.submit', async (route) => {
    await requestGate;
    const response = await route.fetch();
    committed = true;
    await gate;
    await route.fulfill({ response });
  });
  try {
    await workspace.getByRole('button', { name: 'Enviar pedido (1)' }).click();
    await expect(workspace).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
    await expect(page.getByText('Enviando pedido…', { exact: true })).toBeVisible();
    expect(committed).toBe(false);
    expect(releasedGrant).toBe(false);
    releaseBeforeCommit();
    await expect.poll(() => committed).toBe(true);
    await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
    const pin = page.getByRole('dialog', { name: 'Tu PIN' });
    await pin.getByLabel('PIN personal').fill('4303');
    await expect(pin.getByRole('status')).toHaveText('Terminando envío anterior…');
    await expect(workspace).toHaveCount(0);
    release();
    await expect(pin).toHaveCount(0);
    await workspace.getByRole('button', { name: 'Agregar 1 Medialuna' }).click();
    await expect(workspace.getByLabel('Cantidad de Medialuna', { exact: true })).toHaveText('1');
    await expect(workspace.getByRole('button', { name: 'Enviar pedido (1)' })).toBeEnabled();
    await expect.poll(() => committed).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await workspace.getByRole('button', { name: 'Pedido (3)' }).click();
    await expect(workspace.getByRole('button', { name: 'Enviar pedido (1)' })).toBeInViewport();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: 'test-results/pedido-local-enviando.png' });
    await workspace.getByRole('button', { name: 'Salir sin cambios', exact: true }).click();
    await expect(workspace).toHaveCount(0);
    expect(committed).toBe(true);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem(
              'baguette.pending.v2.terminal.50000000-0000-4000-8000-000000000003',
            ) || '[]',
          ).length,
      ),
    ).toBe(0);
    await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
    await identify(page, '4606');
    await expect(workspace.getByRole('button', { name: /^Pendientes/ })).toHaveCount(0);
    await expect(workspace.locator('.local-order-items .order-line')).toHaveCount(0);
  } finally {
    releaseBeforeCommit();
    release();
  }
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const entries = JSON.parse(
          localStorage.getItem(
            'baguette.pending.v2.terminal.50000000-0000-4000-8000-000000000003',
          ) || '[]',
        );
        return entries.length;
      }),
    )
    .toBe(0);
  expect(commands).toHaveLength(1);
  await closeTable(page);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  await workspace.getByRole('button', { name: 'Pedido (2)' }).click();
  await expect(workspace.locator('.local-order-items .order-line')).toHaveCount(0);
  const final = await managementState(page);
  const items = final.items.filter(
    (item: { notes: string }) => item.notes === 'Pedido local rápido',
  );
  expect(items).toHaveLength(1);
  expect(items[0].quantity).toBe(2);
  expect(items[0].status).toBe('sent');
  test
    .info()
    .annotations.push({ type: 'local-add-next-frame-ms', description: latency.toFixed(1) });
});

test('salir sin cambios descarta solo el borrador y la personalización de esta mesa', async ({
  page,
}) => {
  const table = await createTable(page);
  const commands: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/commands/')) commands.push(request.url());
  });
  await page.goto('/');
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  const workspace = page.locator('dialog.order-workspace');
  await workspace.getByLabel('Comensales', { exact: true }).fill('3');
  await workspace.getByRole('button', { name: 'Agregar 1 Medialuna' }).click();
  await workspace.getByRole('button', { name: 'Nota', exact: true }).click();
  await workspace.getByLabel('Observaciones', { exact: true }).fill('Descartar personalización');
  await page.evaluate(() => localStorage.setItem('baguette.local-order.v1.otra-mesa', 'conservar'));
  await workspace.getByRole('button', { name: 'Salir sin cambios', exact: true }).click();
  await expect(workspace).toHaveCount(0);
  expect(commands).toEqual([]);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  await expect(workspace.getByLabel('Comensales', { exact: true })).toHaveValue('1');
  await expect(workspace.locator('.local-order-items .order-line')).toHaveCount(0);
  await workspace.getByRole('button', { name: /^Café \d+ variante/ }).click();
  await expect(workspace.getByLabel('Observaciones', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('baguette.local-order.v1.otra-mesa'))).toBe(
    'conservar',
  );
  const state = await managementState(page);
  expect(state.accounts.some((a: { table_id: string }) => a.table_id === table.id)).toBe(false);
});

test('en Gestión enviar también cierra la mesa antes de que termine la solicitud', async ({
  page,
}) => {
  const table = await createTable(page);
  await page.goto('/gestion');
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page, '4101');
  const workspace = page.locator('dialog.order-workspace');
  await workspace.getByRole('button', { name: 'Abrir cuenta', exact: true }).click();
  await expect(workspace.getByRole('button', { name: 'Abrir cuenta', exact: true })).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Agregar 1 Medialuna' }).click();
  await expect(workspace.getByRole('button', { name: 'Enviar pedido (1)' })).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let committed = false;
  await page.route('**/api/commands/order.submit', async (route) => {
    await gate;
    const response = await route.fetch();
    committed = true;
    await route.fulfill({ response });
  });
  try {
    await workspace.getByRole('button', { name: 'Enviar pedido (1)' }).click();
    await expect(workspace).toHaveCount(0);
    await expect(page.getByText('Enviando pedido…', { exact: true })).toBeVisible();
    expect(committed).toBe(false);
  } finally {
    release();
  }
  await expect(
    page.getByText(`Mesa ${table.label}: pedido confirmado.`, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page, '4101');
  await expect(workspace.getByRole('button', { name: /^Enviados/ })).toBeVisible();
  const state = await managementState(page);
  const account = state.accounts.find((a: { table_id: string }) => a.table_id === table.id);
  const items = state.items.filter((i: { account_id: string }) => i.account_id === account.id);
  expect(items).toHaveLength(1);
  expect(items[0].status).toBe('sent');
});

test('si el dispositivo no puede guardar el envío, conserva la mesa y el borrador', async ({
  page,
}) => {
  const table = await createTable(page);
  await page.goto('/');
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  const workspace = page.locator('dialog.order-workspace');
  await workspace.getByRole('button', { name: 'Agregar 1 Medialuna' }).click();
  let submissions = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/commands/order.submit')) submissions++;
  });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('baguette.pending.'))
        throw new DOMException('No hay espacio para guardar el pedido.', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await workspace.getByRole('button', { name: 'Enviar pedido (1)' }).click();
  await expect(workspace.getByRole('alert')).toContainText('No hay espacio');
  await expect(workspace.getByLabel('Cantidad de Medialuna', { exact: true })).toHaveText('1');
  expect(submissions).toBe(0);
});

test('respuesta perdida: al reabrir se recupera la confirmación sin reenviar el pedido', async ({
  page,
}) => {
  const table = await createTable(page);
  await page.goto('/');
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  const workspace = page.locator('dialog.order-workspace');
  await workspace.getByRole('button', { name: 'Agregar 1 Medialuna' }).click();
  let submissions = 0;
  await page.route('**/api/commands/order.submit', async (route) => {
    submissions++;
    if (submissions === 1) {
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await workspace.getByRole('button', { name: 'Enviar pedido (1)' }).click();
  await expect(workspace).toHaveCount(0);
  await expect(
    page.getByText(new RegExp(`Mesa ${table.label}: el pedido sigue en Pendientes`)),
  ).toBeVisible();
  await page.reload();
  let lookups = 0;
  await page.route('**/api/operations/lookup', async (route) => {
    lookups++;
    await route.continue();
  });
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  await identify(page);
  await expect(workspace.locator('.local-order-items .order-line')).toHaveCount(0);
  await expect.poll(() => lookups).toBe(1);
  await expect(workspace.getByRole('button', { name: /^Pendientes/ })).toHaveCount(0);
  await expect(workspace.locator('.order-sync-status')).toHaveCount(0);
  await expect(workspace.getByRole('button', { name: /^Enviados/ })).toBeVisible();
  expect(submissions).toBe(1);
  const final = await managementState(page);
  const account = final.accounts.find((a: { table_id: string }) => a.table_id === table.id);
  expect(
    final.items.filter((i: { account_id: string }) => i.account_id === account.id),
  ).toHaveLength(1);
});
