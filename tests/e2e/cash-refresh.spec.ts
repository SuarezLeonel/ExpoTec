import { test, expect } from './test';
import { manager } from './shared-helper';

test('Caja cancela el resumen anterior y no reemplaza importes recientes con respuestas viejas', async ({
  page,
}) => {
  await manager(page);
  await page.clock.install();
  let holdNext = false;
  let held = false;
  let updated = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/cash/summary', async (route) => {
    if (holdNext) {
      holdNext = false;
      held = true;
      await gate;
      await route.fulfill({ json: { expected_cents: 11100 } });
    } else {
      await route.fulfill({ json: { expected_cents: updated ? 22200 : 11100 } });
    }
  });
  await page.goto('/gestion#cash');
  const value = page
    .locator('.summary-rows > div')
    .filter({ hasText: 'Efectivo esperado' })
    .locator('strong');
  await expect(value).toContainText('111');
  try {
    holdNext = true;
    await page.clock.runFor(7100);
    await expect.poll(() => held).toBe(true);
    updated = true;
    await page.clock.runFor(7100);
    await expect(value).toContainText('222');
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(value).toContainText('222');
    await expect(page.locator('.alert-danger')).toHaveCount(0);
  } finally {
    release();
  }
});
