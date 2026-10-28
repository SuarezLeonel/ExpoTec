import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const candidates = [process.env.BROWSER_EXECUTABLE, 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
const executablePath = candidates.find((path): path is string => Boolean(path && existsSync(path)));
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: 0,
  timeout: 60_000, expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: { baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5173', headless: true, launchOptions: { executablePath }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
