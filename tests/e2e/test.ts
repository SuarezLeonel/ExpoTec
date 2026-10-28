import { test as base } from '@playwright/test';
import pg from 'pg';

export { expect } from '@playwright/test';
export type { Page, APIRequestContext } from '@playwright/test';

export const test = base.extend<{ rateLimits: void }>({
  rateLimits: [
    async ({ baseURL }, use) => {
      const database = new URL(process.env.DATABASE_URL || 'about:blank');
      if (
        process.env.DEMO_MODE !== 'true' ||
        database.hostname !== '127.0.0.1' ||
        database.pathname !== '/baguette_e2e' ||
        new URL(baseURL!).hostname !== '127.0.0.1'
      )
        throw new Error('El aislamiento de intentos solo admite baguette_e2e local.');
      const client = new pg.Client({ connectionString: database.toString() });
      await client.connect();
      try {
        await client.query('DELETE FROM auth_attempts');
      } finally {
        await client.end();
      }
      await use();
    },
    { auto: true },
  ],
});
