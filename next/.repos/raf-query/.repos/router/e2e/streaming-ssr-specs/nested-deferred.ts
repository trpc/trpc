import { expect, test, testWithHydration } from '../streaming-ssr-assertions'

test.describe('Nested deferred (multiple levels of deferred data)', () => {
  test('all levels of deferred data eventually resolve', async ({ page }) => {
    await page.goto('/nested-deferred')

    // All deferred values should eventually resolve.
    await expect(page.getByTestId('plain-deferred')).toContainText(
      'Plain deferred resolved!',
      { timeout: 5000 },
    )

    await expect(page.getByTestId('level1-data')).toContainText('Level 1:', {
      timeout: 5000,
    })

    await expect(page.getByTestId('level2-data')).toContainText('Level 2:', {
      timeout: 5000,
    })

    await expect(page.getByTestId('level3-data')).toContainText('Level 3:', {
      timeout: 5000,
    })
  })

  testWithHydration(
    'hydration works with nested deferred',
    async ({ page }) => {
      await page.goto('/nested-deferred')
      await page.waitForLoadState('networkidle')

      // Wait for all data
      await expect(page.getByTestId('level3-data')).toBeVisible({
        timeout: 10000,
      })
    },
  )

  test('client-side navigation works', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Navigate via nav link
    await page.getByRole('link', { name: 'Nested Deferred' }).first().click()
    await expect(page).toHaveURL('/nested-deferred')

    // All levels should eventually render
    await expect(page.getByTestId('level3-data')).toBeVisible({
      timeout: 10000,
    })
  })
})
