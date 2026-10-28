import { test, expect } from './test';
import { chooseSector, closeTable, createTable } from './shared-helper';

test('el cuarto dígito valida el PIN una sola vez y un error permite reintentar con foco', async ({
  page,
}) => {
  const table = await createTable(page, 'PIN automático');
  const attempts: string[] = [];
  let release!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth/operational-pin', async (route) => {
    const { pin } = route.request().postDataJSON();
    attempts.push(pin);
    if (pin === '4303') await responseGate;
    await route.continue();
  });
  await page.goto('/');
  await chooseSector(page, table.sector);
  await page.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
  const dialog = page.getByRole('dialog', { name: 'Tu PIN' });
  const input = dialog.getByLabel('PIN personal');
  await expect(input).toBeFocused();
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height });
    const size = await input.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      font: parseFloat(getComputedStyle(element).fontSize),
    }));
    expect(size.height).toBeGreaterThanOrEqual(88);
    expect(size.font).toBeGreaterThanOrEqual(40);
    expect(await dialog.innerText()).not.toContain('DNI');
    expect(await dialog.innerText()).not.toContain('automáticamente');
    await expect(dialog).toBeInViewport();
    await page.screenshot({ path: `test-results/pin-large-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await input.fill('000');
  expect(attempts).toEqual([]);
  await input.pressSequentially('0');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  expect(attempts).toEqual(['0000']);
  await input.fill('43x0');
  await expect(input).toHaveValue('430');
  expect(attempts).toEqual(['0000']);
  try {
    await input.pressSequentially('3');
    await expect.poll(() => attempts).toEqual(['0000', '4303']);
    await expect(input).toBeDisabled();
    await expect(dialog.locator('form')).toHaveAttribute('aria-busy', 'true');
    await expect(dialog.getByRole('status')).toHaveText('Validando PIN…');
    await expect(dialog.getByRole('button', { name: /Validar|Ingresar/ })).toHaveCount(0);
    await page.keyboard.press('Enter');
    expect(attempts).toEqual(['0000', '4303']);
  } finally {
    release();
  }
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('dialog.order-workspace .active-operator')).toHaveText(
    'Martín Camarero',
  );
  expect(attempts).toEqual(['0000', '4303']);
});

for (const entry of [
  { path: '/', pin: '4303', operator: 'Martín Camarero' },
  { path: '/gestion', pin: '4101', operator: 'Ana Encargada' },
]) {
  test(`al abrir mesa en ${entry.path} el PIN bloquea la comandera y se pide de nuevo al reabrir`, async ({
    page,
  }) => {
    const table = await createTable(page);
    let attempts = 0;
    let commands = 0;
    let release!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/commands/**', async (route) => {
      commands++;
      await route.continue();
    });
    await page.route('**/api/auth/operational-pin', async (route) => {
      attempts++;
      await responseGate;
      await route.continue();
    });
    await page.goto(entry.path);
    await chooseSector(page, table.sector);
    const openTable = page.getByRole('button', { name: new RegExp(`^${table.label},`) });
    const pin = page.getByRole('dialog', { name: 'Tu PIN' });
    const workspace = page.locator('dialog.order-workspace');

    await openTable.click();
    await expect(pin).toBeVisible();
    await expect(workspace).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Carta para comandar' })).toHaveCount(0);
    await pin.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(pin).toHaveCount(0);
    await expect(workspace).toHaveCount(0);
    expect(attempts).toBe(0);

    await openTable.click();
    await pin.getByLabel('PIN personal').fill(entry.pin);
    try {
      await expect.poll(() => attempts).toBe(1);
      await expect(pin.getByLabel('PIN personal')).toBeDisabled();
      await expect(workspace).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Carta para comandar' })).toHaveCount(0);
      expect(commands).toBe(0);
    } finally {
      release();
    }
    await expect(pin).toHaveCount(0);
    await expect(workspace.locator('.active-operator')).toHaveText(entry.operator);
    if (entry.path === '/gestion') {
      const session = await page.request.post('/api/auth/session', { data: {} });
      expect((await session.json()).user.username).toBe('admin');
    }
    await closeTable(page);
    await openTable.click();
    await expect(pin).toBeVisible();
    await expect(workspace).toHaveCount(0);
    await pin.getByRole('button', { name: 'Cancelar', exact: true }).click();
    expect(attempts).toBe(1);
    expect(commands).toBe(0);
  });
}
