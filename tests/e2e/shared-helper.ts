import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
export async function manager(page: Page) {
  const auth = await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: process.env.DEMO_PASSWORD },
  });
  expect(auth.ok()).toBeTruthy();
  return (await auth.json()).csrf as string;
}
export async function managementState(page: Page) {
  return (await page.request.post('/api/state', { data: {} })).json();
}
export async function createTable(page: Page, sector = 'Comandera compartida') {
  const csrf = await manager(page);
  const actualSector = ['Salón', 'Patio'].includes(sector) ? sector : 'Salón';
  const state = await managementState(page);
  const x =
    Math.max(
      0,
      ...state.tables
        .filter((t: { sector: string }) => t.sector === actualSector)
        .map(
          (t: { x: number; width?: number; height?: number }) =>
            t.x + (t.width || 92) + (t.height || 92),
        ),
    ) + 120;
  const label = `T-${Date.now().toString().slice(-7)}`;
  const response = await page.request.post('/api/commands/table.save', {
    data: {
      label,
      capacity: 4,
      sector: actualSector,
      x,
      y: 40,
      active: true,
    },
    headers: { 'X-CSRF-Token': csrf, 'Idempotency-Key': randomUUID() },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return { ...(await response.json()).result, label, sector: actualSector };
}
export async function chooseSector(page: Page, sector: string) {
  const select = page.getByRole('combobox', { name: /sector/i });
  await expect(select).toBeVisible();
  await select.selectOption({ label: sector });
}
export async function identify(page: Page, pin = '4303') {
  const dialog = page.getByRole('dialog', { name: 'Tu PIN' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('PIN personal').fill(pin);
  await expect(dialog).not.toBeVisible();
}
export async function closeTable(page: Page) {
  await page
    .locator('dialog.order-workspace > .sheet-heading')
    .getByRole('button', { name: 'Cerrar panel' })
    .click();
  await expect(page.locator('dialog.order-workspace')).toHaveCount(0);
}
export async function reopenAfterSend(page: Page, label: string, pin = '4303') {
  await expect(page.locator('dialog.order-workspace')).toHaveCount(0);
  await expect(page.getByText(`Mesa ${label}: pedido confirmado.`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${label},`) }).click();
  await identify(page, pin);
}
