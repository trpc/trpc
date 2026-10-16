import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('applies styles imported with css?url during SSR', async ({ page }) => {
  const response = await page.goto('/rsc-css-url')
  expect(response?.status()).toBe(200)

  const card = page.getByTestId('rsc-css-url-card')
  await expect(card).toBeVisible()

  const backgroundColor = await card.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  )
  expect(backgroundColor).toBe('rgb(236, 253, 245)')
})
