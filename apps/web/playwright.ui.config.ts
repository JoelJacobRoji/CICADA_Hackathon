import { defineConfig, devices } from '@playwright/test'

// UI screenshot gallery (docs/judging/ui). Runs against a LOCAL stack only (default
// http://127.0.0.1:5180 = `vite preview` proxying /api to a local SaaS). Credentials come from the
// environment (AEGIS_UI_EMAIL / AEGIS_UI_PASSWORD); never from files in the repo.
export default defineConfig({
  testDir: './ui-shots',
  timeout: 600_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.AEGIS_UI_URL ?? 'http://127.0.0.1:5180',
    trace: 'off',
    screenshot: 'off',
    ...devices['Desktop Chrome'],
  },
})
