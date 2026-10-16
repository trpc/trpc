import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { isSpaMode } from './utils/isSpaMode'
import { isPrerender } from './utils/isPrerender'

test.skip(isSpaMode || isPrerender, 'Requires dynamic SSR')

test.use({
  whitelistErrors: [
    'Failed to load resource: the server responded with a status of 500',
  ],
})

test('normalizes errors during SSR, hydration, and client navigation', async ({
  page,
}) => {
  const response = await page.goto('/error-normalization?kind=string')
  expect(response?.status()).toBe(500)
  const html = await response!.text()
  expect(html).toContain('data-name="Error"')
  expect(html).toContain('data-message="loader failure"')
  expect(html).toContain('data-cause="loader failure"')

  const details = page.getByTestId('error-details')
  await expect(details).toHaveAttribute('data-hydrated', 'true')
  await expect(details).toHaveAttribute('data-name', 'Error')
  await expect(details).toHaveAttribute('data-message', 'loader failure')
  await expect(details).toHaveAttribute('data-cause', 'loader failure')

  await page.getByRole('link', { name: 'Throw null' }).click()
  await expect(details).toHaveAttribute('data-hydrated', 'true')
  await expect(details).toHaveAttribute('data-name', 'Error')
  await expect(details).toHaveAttribute('data-message', 'Unknown error')
  await expect(details).toHaveAttribute('data-cause', 'null')
})
