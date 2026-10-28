import { test, expect } from './test';

test('espera de formulario, disponibilidad parcial, movimiento reducido y controles táctiles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  let releaseLogin!: () => void;
  const loginGate = new Promise<void>((resolve) => {
    releaseLogin = resolve;
  });
  await page.route('**/api/auth/login', async (route) => {
    await loginGate;
    await route.continue();
  });
  await page.goto('/gestion');
  const username = page.getByLabel(/^Usuario/);
  const password = page.getByLabel(/^Contraseña/);
  await username.fill('admin');
  await password.fill(process.env.DEMO_PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar turno', exact: true }).click();
  try {
    await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true');
    await expect(username).toBeDisabled();
    await expect(password).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Guardando…', exact: true })).toBeDisabled();
    await page.screenshot({ path: 'test-results/design-loading-390.png', fullPage: true });
  } finally {
    releaseLogin();
  }
  await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
  await page.unroute('**/api/auth/login');

  await page.route('**/api/public/menu', async (route) => {
    await route.fulfill({
      json: {
        categories: [{ id: 'design-category', name: 'Selección de prueba', active: true }],
        products: [
          {
            id: 'design-unavailable',
            category_id: 'design-category',
            name: 'Café de especialidad con leche vegetal y un nombre largo de prueba',
            description: 'Producto ficticio sin disponibilidad temporal.',
            price_cents: 450000,
            image_url: '',
            available: false,
          },
          {
            id: 'design-available',
            category_id: 'design-category',
            name: 'Pan de prueba disponible',
            description: 'El resto de la carta sigue visible.',
            price_cents: 250000,
            image_url: '',
            available: true,
          },
        ],
      },
    });
  });
  await page.goto('/carta');
  const unavailable = page.locator('.menu-product').filter({ hasText: 'Café de especialidad' });
  const available = page.locator('.menu-product').filter({ hasText: 'Pan de prueba disponible' });
  await expect(unavailable.getByText('Sin disponibilidad', { exact: true })).toBeVisible();
  await expect(available).toBeVisible();
  await expect(available.getByText('Sin disponibilidad', { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/design-partial-390.png', fullPage: true });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'El salón', exact: true })).toBeVisible();
  const motion = await page
    .locator('.table-tile')
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        requested: matchMedia('(prefers-reduced-motion: reduce)').matches,
        transition: style.transitionDuration,
        animation: style.animationDuration,
        scroll: getComputedStyle(document.documentElement).scrollBehavior,
      };
    });
  expect(motion).toEqual({ requested: true, transition: '0s', animation: '0s', scroll: 'auto' });
  const controls = await page
    .locator(
      '.terminal-header nav a, .terminal-header nav button, .terminal-main .segmented button, .floor-pagination button, .salon-search input, .salon-sector select',
    )
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name:
            element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName,
          width: rect.width,
          height: rect.height,
        };
      }),
    );
  // Eight fixed controls; pagination is present only when the table count requires it.
  expect(controls.length).toBeGreaterThanOrEqual(8);
  for (const control of controls) {
    expect(control.width, `${control.name}: ancho táctil`).toBeGreaterThanOrEqual(44);
    expect(control.height, `${control.name}: alto táctil`).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: 'test-results/design-touch-motion-390.png', fullPage: true });
});
