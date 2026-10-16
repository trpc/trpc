import { apiTest as test } from '@tanstack/router-e2e-utils'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('placeholder test', async ({ page }) => {
  // This is a placeholder test
  await page.waitForLoadState('networkidle')
})
