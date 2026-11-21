import { expect, test, type Page } from '@playwright/test'

const SHOTS = process.env.AEGIS_E2E_SHOTS ?? '../../docs/judging/evidence/screenshots'

/** Every chart on the page has real data (>= 2 windows) before we capture evidence. */
async function chartsLoaded(page: Page) {
  await expect.poll(async () => page.locator('[role="img"]').evaluateAll((els) =>
    els.length > 0 && els.every((e) => Number(/: (\d+) windows/.exec(e.getAttribute('aria-label') ?? '')?.[1] ?? 0) >= 2)),
  { timeout: 20_000 }).toBe(true)
}

// The session comes from the `setup` project (auth.setup.ts), signed in once per run.
async function signIn(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Operational overview' })).toBeVisible()
}

test('@live security headers are served on the dashboard', async ({ request }) => {
  const r = await request.get('/')
  expect(r.status()).toBe(200)
  const h = r.headers()
  expect(h['content-security-policy']).toContain("default-src 'self'")
  expect(h['strict-transport-security']).toBeTruthy()
  expect(h['x-frame-options']).toBe('DENY')
  expect(await r.text()).toContain('<div id="root">')
})

test('@live K36: incident figures (KPI cards + header pill) load within 5 s', async ({ page }) => {
  const t0 = Date.now()
  const resp = page.waitForResponse((r) => r.url().includes('/api/v1/aiops/summary'), { timeout: 30_000 })
  await page.goto('/')
  const r = await resp
  const apiMs = Date.now() - t0
  await expect(page.getByText(/^P1 \d+ · P2 \d+ · P3 \d+$/)).toBeVisible({ timeout: 30_000 })
  const cardMs = Date.now() - t0
  console.log(`K36 timing: first /aiops/summary response ${apiMs} ms (HTTP ${r.status()}), KPI card filled ${cardMs} ms`)
  expect(r.status()).toBe(200)
  expect(cardMs).toBeLessThan(5_000)
})

test('@live egress receipts list real payload hashes and ingest batches', async ({ page }) => {
  await signIn(page)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Egress receipts' }).click()
  await expect(page.getByRole('heading', { name: 'Egress receipts' })).toBeVisible()
  const firstHash = page.getByRole('table', { name: 'Payload receipts' }).locator('tbody tr').first().locator('code[title]').last()
  await expect(firstHash).toHaveAttribute('title', /^[0-9a-f]{64}$/, { timeout: 20_000 })
  await expect(page.getByRole('table', { name: 'Ingest batches' }).locator('tbody tr').first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/egress-receipts.png`, fullPage: true })
})

test('@live sign in -> overview shows real health from the API, live connection', async ({ page }) => {
  await signIn(page)
  await expect(page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible()
  await expect(page.getByText('Collectors online')).toBeVisible()
  await expect(page.getByText(/Data source:.*SYNTHETIC/)).toBeVisible()
  // The tenant badge is populated from the session, not hard-coded.
  await expect(page.getByText('tenant · acme')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Loading/ })).toHaveCount(0) // all cards loaded
  await page.screenshot({ path: `${SHOTS}/overview.png`, fullPage: true })
})

test('@live infrastructure charts update WITHOUT reload (WebSocket)', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Infrastructure' }).click()
  const latest = page.locator('.multiple .latest').first()
  await expect(latest).toBeVisible()
  // The chart's accessible label encodes "<n> windows, latest <v>" from the data it renders.
  // (Not an SVG path: ECharts' first <path> is a static axis line, which made v1 of this test wrong.)
  const chart = page.locator('.multiple [role="img"]').first()
  const before = await chart.getAttribute('aria-label')
  const reloads: string[] = []
  page.on('framenavigated', (f) => f === page.mainFrame() && reloads.push(f.url()))
  // New 2 s windows arrive over the WebSocket; the rendered data must change in place.
  await expect.poll(async () => chart.getAttribute('aria-label'), { timeout: 30_000 }).not.toBe(before)
  expect(reloads, 'page must not reload').toEqual([])
  await chartsLoaded(page)
  await page.screenshot({ path: `${SHOTS}/infrastructure.png`, fullPage: true })
})

test('@live source detail explains its state', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Infrastructure' }).click()
  await page.locator('.multiple .card-title a').first().click()
  await expect(page.getByText('Current health')).toBeVisible()
  await expect(page.getByText('Factors (latest window per metric)')).toBeVisible()
  await expect(page.getByText('State history')).toBeVisible()
  await chartsLoaded(page)
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

test('@live AI engine: a new baseline-deviation incident appears WITHOUT reload', async ({ page }) => {
  // S5 starts at t+70 s (after >= 30 windows of baseline): CPU steps to ~80%, below the static
  // 85% threshold, so only the statistical baseline detector can catch it.
  test.setTimeout(240_000)
  await signIn(page)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Incident center' }).click()
  await page.getByRole('button', { name: 'Open' }).click()
  const row = page.getByRole('row', { name: /Baseline deviation on server .*cpu_usage/ }).first()
  await expect(row).toBeVisible({ timeout: 200_000 })
  await expect(page.getByText(/^Blast radius · \d+ sources?$/)).toBeVisible({ timeout: 20_000 }) // preview pane loaded
  await page.screenshot({ path: `${SHOTS}/incident-center.png`, fullPage: true })
  await row.getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Probable cause' })).toBeVisible()
  await expect(page.getByText(/robust z/).first()).toBeVisible()
  await expect(page.getByText('Recommended actions')).toBeVisible()
  // Grounded LLM explanation arrives asynchronously (pushed over the WebSocket).
  await expect(page.getByText(/Grounding check passed/)).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: /Show the exact prompt sent/ }).click()
  await expect(page.locator('pre.prompt')).toContainText('EVIDENCE JSON')
  await expect(page.locator('pre.prompt')).not.toContainText('SRV_002') // pseudonymous only
  await page.getByRole('button', { name: /Hide the exact prompt sent/ }).click()
  await page.screenshot({ path: `${SHOTS}/incident-detail-ai.png`, fullPage: true })
})

test('@live security & privacy page passes its live checks', async ({ page }) => {
  await signIn(page)
  await page.getByRole('link', { name: 'Security & privacy' }).click()
  await expect(page.getByRole('heading', { name: 'Security & privacy' })).toBeVisible()
  await expect(page.locator('.trust-list .state-excellent')).toHaveCount(5) // icon + 'Pass'
  await expect(page.locator('.trust-list .state-poor')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/security-privacy.png`, fullPage: true })
})

test('@live sign out clears access', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  const r = await page.request.get('/api/v1/health/summary')
  expect(r.status()).toBe(401)
})
