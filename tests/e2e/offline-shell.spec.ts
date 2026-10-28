import { test, expect } from './test';

test('la versión compilada conserva un shell offline acotado y respeta las cachés ajenas', async ({
  page,
  context,
}) => {
  const worker = await page.request.get('/sw.js');
  const script = await worker.text();
  expect(script).toMatch(/baguette-shell-[a-f0-9]{16}/);
  expect(script).not.toContain('__BUILD_ID__');
  await page.goto('/brand/baguette-logo.svg');
  await page.evaluate(async () => {
    await (await caches.open('otro-sistema')).put('/ajeno', new Response('conservar'));
    await (await caches.open('baguette-shell-v2')).put('/viejo', new Response('anterior'));
  });
  await page.goto('/gestion');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const snapshot = () =>
    page.evaluate(async () => {
      const names = await caches.keys();
      const name = names.find((key) => key.startsWith('baguette-shell-'))!;
      const keys = await (await caches.open(name)).keys();
      return { names: names.sort(), paths: keys.map((key) => new URL(key.url).pathname).sort() };
    });
  const before = await snapshot();
  expect(before.names).toContain('otro-sistema');
  expect(before.names).not.toContain('baguette-shell-v2');
  expect(before.paths).toContain('/');
  expect(before.paths.some((path) => path.startsWith('/assets/'))).toBe(true);
  for (let i = 0; i < 3; i++) await page.goto(`/gestion?mesa=${i}`);
  expect(await snapshot()).toEqual(before);
  await context.setOffline(true);
  await page.goto('/gestion?mesa=offline');
  await expect(page.getByRole('heading', { name: 'Acceso de gestión', exact: true })).toBeVisible();
  expect(await snapshot()).toEqual(before);
});
