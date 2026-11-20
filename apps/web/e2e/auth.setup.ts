import { expect, test as setup } from '@playwright/test'

// Signs in ONCE per run and saves the session (production rate-limits logins to 5/min).
export const STATE = 'test-results/.auth-state.json' // git-ignored

setup('@live @offline sign in once', async ({ page }) => {
  const email = process.env.AEGIS_E2E_EMAIL ?? ''
  const password = process.env.AEGIS_E2E_PASSWORD ?? ''
  if (!email || !password) throw new Error('AEGIS_E2E_EMAIL / AEGIS_E2E_PASSWORD not set')
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Operational overview' })).toBeVisible()
  await page.context().storageState({ path: STATE })
})
