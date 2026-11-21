import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Captures every page in light + dark at 1440 px and 390 px into docs/judging/ui/<label>/.
// AEGIS_UI_LABEL = before | after. Pages that do not exist in a build (e.g. /topology before
// the upgrade) are skipped, never faked.
const LABEL = process.env.AEGIS_UI_LABEL ?? 'after'
const OUT = process.env.AEGIS_UI_OUT ?? `../../docs/judging/ui/${LABEL}`
const THEMES = ['light', 'dark'] as const
const WIDTHS = [1440, 390] as const

async function settle(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: /^Loading/ })).toHaveCount(0)
  await page.waitForTimeout(1200) // let charts/animations finish so screenshots are stable
}

async function signIn(page: Page) {
  const email = process.env.AEGIS_UI_EMAIL
  const password = process.env.AEGIS_UI_PASSWORD
  if (!email || !password) throw new Error('AEGIS_UI_EMAIL / AEGIS_UI_PASSWORD not set')
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Operational overview' })).toBeVisible()
}

test('screenshot gallery', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true })
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width, height: width > 500 ? 900 : 844 },
        colorScheme: theme,
        deviceScaleFactor: 1,
      })
      await ctx.addInitScript((t) => {
        try { localStorage.setItem('aegis-theme', t) } catch { /* ignore */ }
      }, theme)
      const page = await ctx.newPage()
      const shot = async (name: string) =>
        page.screenshot({ path: `${OUT}/${name}-${theme}-${width}.png`, fullPage: true })

      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await page.waitForTimeout(800)
      await shot('login')
      await signIn(page)
      await settle(page)
      await shot('overview')

      const pages: [string, string][] = [
        ['fleet', '/fleet'], ['infrastructure', '/infrastructure'], ['network', '/network'],
        ['security', '/security'], ['incidents', '/incidents'], ['topology', '/topology'],
        ['trust', '/trust'], ['receipts', '/receipts'], ['settings', '/settings'],
      ]
      for (const [name, path] of pages) {
        await page.goto(path)
        if (await page.getByText('Page not found').isVisible().catch(() => false)) continue
        await settle(page)
        await shot(name)
      }

      // Detail pages: follow the first real link, if any (never a hard-coded ID).
      await page.goto('/incidents')
      await settle(page)
      const inc = page.locator('table[aria-label="Incidents"] tbody tr a').first()
      if (await inc.count()) {
        await inc.click()
        await settle(page)
        await shot('incident-detail')
      }
      await page.goto('/infrastructure')
      await settle(page)
      const src = page.locator('.multiple .card-title a').first()
      if (await src.count()) {
        await src.click()
        await settle(page)
        await shot('source-detail')
      }
      await ctx.close()
    }
  }
})
