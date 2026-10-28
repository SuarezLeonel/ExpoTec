import { expect, type Page } from '@playwright/test';
export async function operationGrant(page: Page, action: string, body: unknown, csrf: string) {
  if (!['account.open', 'item.add', 'item.edit', 'order.send'].includes(action)) return {};
  const data = body as { table_id?: string; account_id?: string };
  const state = await (await page.request.post('/api/state', { data: {} })).json();
  const tableId =
    data.table_id || state.accounts.find((a: { id: string }) => a.id === data.account_id)?.table_id;
  const session = await (await page.request.post('/api/auth/session', { data: {} })).json();
  const pin = (
    { admin: '4101', caja: '4202', mozo: '4303', moza: '4606' } as Record<string, string>
  )[session.user.username];
  const response = await page.request.post('/api/auth/operational-pin', {
    data: { table_id: tableId, pin },
    headers: { 'X-CSRF-Token': csrf },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return { 'X-Operation-Token': (await response.json()).token as string };
}
