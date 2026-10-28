import { test, expect } from './test';
import { createTable, chooseSector, identify, managementState } from './shared-helper';

test('una terminal puede enviar mientras otra conserva una respuesta demorada', async ({
  page,
  browser,
}) => {
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const first = await createTable(page);
    const second = await createTable(other);
    for (const [terminal, table, pin] of [
      [page, first, '4303'],
      [other, second, '4606'],
    ] as const) {
      await terminal.goto('/');
      await chooseSector(terminal, table.sector);
      await terminal.getByRole('button', { name: new RegExp(`^${table.label},`) }).click();
      await identify(terminal, pin);
      await terminal.getByRole('button', { name: 'Agregar 1 Medialuna', exact: true }).click();
    }
    let committed = false;
    await page.route('**/api/commands/order.submit', async (route) => {
      const response = await route.fetch();
      committed = true;
      await gate;
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Enviar pedido (1)', exact: true }).click();
    await expect.poll(() => committed).toBe(true);
    await other.getByRole('button', { name: 'Enviar pedido (1)', exact: true }).click();
    await expect(
      other.getByText(`Mesa ${second.label}: pedido confirmado.`, { exact: true }),
    ).toBeVisible();
    release();
    await expect(
      page.getByText(`Mesa ${first.label}: pedido confirmado.`, { exact: true }),
    ).toBeVisible();
    const state = await managementState(page);
    for (const table of [first, second]) {
      const account = state.accounts.find((a: { table_id: string }) => a.table_id === table.id);
      expect(
        state.items.filter((i: { account_id: string }) => i.account_id === account.id),
      ).toHaveLength(1);
    }
  } finally {
    release();
    await otherContext.close();
  }
});
