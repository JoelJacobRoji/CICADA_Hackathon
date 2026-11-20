import { defineConfig, devices } from '@playwright/test'

// Live end-to-end tests against a REAL deployment (default: the VPS). Credentials come from the
// environment only (scripts/e2e_live.py reads the git-ignored demo credentials file).
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.AEGIS_E2E_URL ?? 'https://aegis.162-35-42-114.sslip.io',
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: 'test-results/.auth-state.json',
      },
    },
  ],
})
