import { expect, test, type Page } from '@playwright/test'

const EMAIL = process.env.AEGIS_E2E_EMAIL ?? ''
const PASSWORD = process.env.AEGIS_E2E_PASSWORD ?? ''
const SHOTS = process.env.AEGIS_E2E_SHOTS ?? '../../docs/judging/evidence/screenshots'

async function signIn(page: Page) {
  await page.goto('/')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Operational overview' })).toBeVisible()
}

test.beforeAll(() => {
  if (!EMAIL || !PASSWORD) throw new Error('AEGIS_E2E_EMAIL / AEGIS_E2E_PASSWORD not set')
})

test('@live security headers are served on the dashboard', async ({ request }) => {
  const r = await request.get('/')
  expect(r.status()).toBe(200)
  const h = r.headers()
  expect(h['content-security-policy']).toContain("default-src 'self'")
  expect(h['strict-transport-security']).toBeTruthy()
  expect(h['x-frame-options']).toBe('DENY')
  expect(await r.text()).toContain('<div id="root">')
})

test('@live sign in -> overview shows real health from the API, live connection', async ({ page }) => {
  await signIn(page)
  await expect(page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible()
  await expect(page.getByText('Collectors online')).toBeVisible()
  await expect(page.getByText(/Data source:.*SIMULATED/)).toBeVisible()
  // The tenant badge is populated from the session, not hard-coded.
  await expect(page.getByText('tenant · acme')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/overview.png`, fullPage: true })
})

test('@live infrastructure charts update WITHOUT reload (WebSocket)', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Infrastructure' }).click()
  const latest = page.locator('.multiple .latest').first()
  await expect(latest).toBeVisible()
  const before = await page.locator('.multiple svg path').first().getAttribute('d')
  // New 2 s windows arrive over the WebSocket; the chart path must change in place.
  await expect.poll(async () => page.locator('.multiple svg path').first().getAttribute('d'),
    { timeout: 30_000 }).not.toBe(before)
  await page.screenshot({ path: `${SHOTS}/infrastructure.png`, fullPage: true })
})

test('@live source detail explains its state', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Infrastructure' }).click()
  await page.locator('.multiple .card-title a').first().click()
  await expect(page.getByText('Current health')).toBeVisible()
  await expect(page.getByText('Factors (latest window per metric)')).toBeVisible()
  await expect(page.getByText('State history')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/source-detail.png`, fullPage: true })
})

test('@live fleet shows the collector online', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Collector fleet' }).click()
  const row = page.getByRole('row', { name: /col_acme_01/ })
  await expect(row).toContainText('online')
  await page.screenshot({ path: `${SHOTS}/fleet-online.png`, fullPage: true })
})

test('@offline fleet turns the collector Poor (offline) without reload', async ({ page }) => {
  // Run AFTER the collector has been stopped (scripts/e2e_live.py does this).
  await signIn(page)
  await page.getByRole('link', { name: 'Collector fleet' }).click()
  const row = page.getByRole('row', { name: /col_acme_01/ })
  await expect(row.locator('[data-state="Poor"]')).toBeVisible({ timeout: 70_000 })
  await expect(page.getByText(/No heartbeat for .* collector considered offline/)).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/fleet-offline.png`, fullPage: true })
})

test('@live sign out clears access', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  const r = await page.request.get('/api/v1/health/summary')
  expect(r.status()).toBe(401)
})
