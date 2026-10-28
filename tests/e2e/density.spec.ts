import { test, expect } from './test';
import { randomUUID } from 'node:crypto';
import { chooseSector, identify, manager, managementState } from './shared-helper';

test('plano continuo: 80 mesas conservan posición y son accesibles en seis tamaños con PIN al tocar', async ({
  page,
}) => {
  const csrf = await manager(page);
  const sector = 'Patio';
  const state = await managementState(page);
  const baseX = Math.max(0, ...state.tables.map((table: { x: number }) => table.x)) + 500;
  for (let i = 0; i < 80; i++) {
    const response = await page.request.post('/api/commands/table.save', {
      data: {
        label: `D${String(i + 1).padStart(2, '0')}`,
        sector,
        capacity: 4,
        x: baseX + (i % 16) * 160,
        y: 40 + Math.floor(i / 16) * 160,
        active: true,
      },
      headers: { 'X-CSRF-Token': csrf, 'Idempotency-Key': randomUUID() },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
  for (const [width, height] of [
    [1440, 900],
    [1519, 639],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height });
    await chooseSector(page, sector);
    expect(
      await page.evaluate(() => ({
        x: document.documentElement.scrollWidth <= innerWidth + 1,
        y: document.documentElement.scrollHeight <= innerHeight + 1,
      })),
      `${width}x${height}: el desplazamiento pertenece al plano`,
    ).toEqual({ x: true, y: true });
    const tables = page.getByRole('button', { name: /^D\d{2},/ });
    await expect(tables).toHaveCount(80);
    const positions = await tables.evaluateAll((elements) =>
      elements.map((element) => ({
        label: element.getAttribute('aria-label')!.split(',')[0],
        x: parseInt((element as HTMLElement).style.left),
        y: parseInt((element as HTMLElement).style.top),
      })),
    );
    for (const position of positions) {
      const index = Number(position.label.slice(1)) - 1;
      expect(position).toEqual({
        label: position.label,
        x: baseX + (index % 16) * 160,
        y: 40 + Math.floor(index / 16) * 160,
      });
    }
    for (const index of [0, 39, 79]) {
      await tables.nth(index).scrollIntoViewIfNeeded();
      await expect(tables.nth(index)).toBeInViewport();
    }
    if (width === 320) await page.screenshot({ path: 'test-results/plano-continuo-320.png' });
  }
  await page.getByRole('button', { name: /^D01, libre/ }).click();
  await expect(page.getByRole('dialog', { name: 'Tu PIN' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Carta para comandar' })).toHaveCount(0);
  await identify(page);
  await expect(page.getByRole('button', { name: 'Agregar 1 Medialuna' })).toBeVisible();
});
