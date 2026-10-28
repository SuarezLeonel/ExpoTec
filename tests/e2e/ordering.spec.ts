import { test, expect } from './test';
import AxeBuilder from '@axe-core/playwright';
import {
  chooseSector,
  closeTable,
  createTable,
  identify,
  managementState,
  manager,
  reopenAfterSend,
} from './shared-helper';

test('mesa ocupada pide PIN antes de mostrar carta e identifica al mozo sin selector', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await manager(page);
  const before = await managementState(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
  await expect(page.getByLabel(/^Usuario/)).toHaveCount(0);
  await chooseSector(page, 'Salón');
  await page.getByRole('button', { name: /^1, .*cuentas/ }).click();
  const pin = page.getByRole('dialog', { name: 'Tu PIN' });
  await expect(pin).toBeVisible();
  await expect(page.getByRole('region', { name: 'Carta para comandar' })).toHaveCount(0);
  await expect(pin.getByRole('combobox')).toHaveCount(0);
  await pin.getByLabel('PIN personal').fill('0000');
  await expect(pin.getByRole('alert')).toBeVisible();
  expect((await managementState(page)).items.length).toBe(before.items.length);
  await identify(page);
  const workspace = page.locator('dialog.order-workspace');
  await expect(workspace.getByText(/Martín Camarero/).first()).toBeVisible();
  await expect(workspace.getByLabel(/^Camarero/)).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Agregar 1 Medialuna', exact: true }).click();
  expect((await managementState(page)).items.length).toBe(before.items.length);
  await workspace.getByRole('button', { name: /Enviar pedido/ }).click();
  await reopenAfterSend(page, '1');
  await expect(workspace.getByRole('button', { name: /Enviar pedido/ })).toHaveCount(0);
  await expect(workspace.getByRole('button', { name: /^Pendientes/ })).toHaveCount(0);
  expect((await managementState(page)).items.length).toBe(before.items.length + 1);
  await expect(workspace.getByRole('button', { name: /^Enviados/ })).toBeVisible();
  for (const action of ['Entregar', 'Marcar listo', 'Preparar'])
    await expect(workspace.getByRole('button', { name: action, exact: true })).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Opciones de cuenta' }).click();
  for (const name of [/Descuento/, /^Anular$/, /^Cobrar$/, /^Cerrar cuenta$/])
    await expect(workspace.getByRole('button', { name })).toHaveCount(0);
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toContain('4303');
  expect(storage).not.toContain('X-Operation-Token');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);
  await workspace.getByRole('button', { name: 'Opciones de cuenta' }).click();
  await page.screenshot({ path: 'test-results/comanda-mesa-ocupada.png' });
  await closeTable(page);
  await page.getByRole('button', { name: /^1, .*cuentas/ }).click();
  await expect(pin).toBeVisible();
  await expect(workspace).toHaveCount(0);
});

test('mesa libre usa PIN para asignar responsable y el mismo equipo cambia de empleado', async ({
  page,
}) => {
  const fixture = await createTable(page);
  await page.goto('/');
  await chooseSector(page, fixture.sector);
  await page.getByRole('button', { name: new RegExp(`^${fixture.label},`) }).click();
  await expect(page.locator('dialog.order-workspace')).toHaveCount(0);
  await identify(page, '4606');
  const workspace = page.locator('dialog.order-workspace');
  await expect(workspace.getByLabel(/^Camarero/)).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Agregar 1 Medialuna' }).click();
  await expect(workspace.getByLabel('Cantidad de Medialuna', { exact: true })).toBeVisible();
  await workspace.getByRole('button', { name: 'Enviar pedido (1)' }).click();
  await reopenAfterSend(page, fixture.label, '4606');
  await expect(workspace.getByRole('button', { name: /^Pendientes/ })).toHaveCount(0);
  const data = await managementState(page);
  const account = data.accounts.find((a: { table_id: string }) => a.table_id === fixture.id);
  expect(account.waiter_id).toBe('50000000-0000-4000-8000-000000000006');
  await closeTable(page);
  await page.getByRole('button', { name: new RegExp(`^${fixture.label},`) }).click();
  await identify(page, '4303');
  await expect(workspace.getByText(/Martín Camarero/).first()).toBeVisible();
  await workspace.getByRole('button', { name: 'Agregar 1 Medialuna' }).click();
  await expect(workspace.getByLabel('Cantidad de Medialuna', { exact: true })).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await workspace.getByRole('button', { name: 'Pedido (2)', exact: true }).click();
  await expect(workspace.getByRole('button', { name: 'Opciones de cuenta' })).toBeInViewport();
  await expect(workspace.getByRole('button', { name: 'Enviar pedido (1)' })).toBeInViewport();
  await workspace.getByRole('button', { name: 'Enviar pedido (1)' }).click();
  await reopenAfterSend(page, fixture.label);
  await workspace.getByRole('button', { name: 'Pedido (2)', exact: true }).click();
  await expect(workspace.getByRole('button', { name: /^Pendientes/ })).toHaveCount(0);
  expect(
    (await managementState(page)).items
      .filter((i: { account_id: string; status: string }) => i.account_id === account.id)
      .every((i: { status: string }) => i.status === 'sent'),
  ).toBeTruthy();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({ path: 'test-results/comanda-movil.png' });
});

test('gestión con contraseña coexiste con comandera general y PIN de caja habilita sus acciones', async ({
  page,
}) => {
  const fixture = await createTable(page);
  await page.context().clearCookies({ name: 'baguette_session' });
  await page.goto('/');
  await chooseSector(page, fixture.sector);
  await page.getByRole('button', { name: new RegExp(`^${fixture.label},`) }).click();
  await identify(page, '4202');
  const workspace = page.locator('dialog.order-workspace');
  await expect(workspace.getByText(/Carla Cajera/).first()).toBeVisible();
  await workspace.getByRole('button', { name: 'Agregar 1 Medialuna' }).click();
  await expect(workspace.getByLabel('Cantidad de Medialuna', { exact: true })).toBeVisible();
  await workspace.getByRole('button', { name: 'Enviar pedido (1)' }).click();
  await reopenAfterSend(page, fixture.label, '4202');
  await expect(workspace.getByRole('button', { name: /^Pendientes/ })).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Opciones de cuenta' }).click();
  await expect(workspace.getByRole('button', { name: /Descuento/ })).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Cobrar', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Catálogo', exact: true })).toHaveCount(0);
  const management = await page.context().newPage();
  await management.goto('/gestion');
  await management.getByLabel(/^Usuario/).fill('admin');
  await management.getByLabel(/^Contraseña/).fill(process.env.DEMO_PASSWORD!);
  await management.getByRole('button', { name: 'Iniciar turno' }).click();
  await management.getByRole('button', { name: 'Catálogo', exact: true }).click();
  await expect(management.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible();
  await expect(workspace.getByText(/Carla Cajera/).first()).toBeVisible();
  const terminalSession = await page.request.post('/api/auth/session', {
    data: {},
    headers: { 'X-Session-Mode': 'terminal' },
  });
  expect(terminalSession.ok()).toBeTruthy();
  expect((await terminalSession.json()).user.role).toBe('terminal');
  await closeTable(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Catálogo', exact: true })).toHaveCount(0);
  await management.close();
});

test('comandera compartida conserva borrador offline y solo su empleado puede sincronizarlo', async ({
  page,
  context,
}) => {
  const fixture = await createTable(page, 'Resiliencia compartida');
  await page.goto('/');
  await chooseSector(page, fixture.sector);
  await page.getByRole('button', { name: new RegExp(`^${fixture.label},`) }).click();
  await identify(page, '4303');
  const workspace = page.locator('dialog.order-workspace');
  await workspace.getByRole('button', { name: 'Agregar 1 Medialuna' }).click();
  await expect(workspace.getByLabel('Cantidad de Medialuna', { exact: true })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await workspace.getByRole('button', { name: /^Medialuna/ }).click();
  const marker = `Pendiente ${fixture.label}`;
  await workspace.getByRole('button', { name: 'Nota', exact: true }).click();
  await workspace.getByLabel('Observaciones').fill(marker);
  await workspace.getByRole('button', { name: 'Guardar nota' }).click();
  await workspace.getByRole('button', { name: 'Enviar pedido (1)' }).click();
  await expect(workspace).toHaveCount(0);
  await expect(page.getByText(/Pedido guardado en el dispositivo/)).toBeVisible();
  await page.reload();
  await expect(workspace).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Carta para comandar' })).toHaveCount(0);
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
  await chooseSector(page, fixture.sector);
  await page.getByRole('button', { name: new RegExp(`^${fixture.label},`) }).click();
  await identify(page, '4606');
  await expect(workspace.getByRole('button', { name: /^Pendientes/ })).toHaveCount(0);
  await closeTable(page);
  await page.getByRole('button', { name: new RegExp(`^${fixture.label},`) }).click();
  await identify(page, '4303');
  await workspace.getByRole('button', { name: 'Pendientes (1)' }).click();
  const queue = page.getByRole('dialog', { name: 'Pendientes' });
  await queue.getByRole('button', { name: 'Sincronizar' }).click();
  await expect(queue.getByText('No tenés operaciones pendientes.')).toBeVisible();
  const final = await managementState(page);
  expect(final.items.filter((i: { notes: string }) => i.notes === marker)).toHaveLength(1);
});
