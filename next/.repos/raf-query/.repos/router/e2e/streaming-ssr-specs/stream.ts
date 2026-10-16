import { expect, test, testWithHydration } from '../streaming-ssr-assertions'

const expectedStreamChunks = [
  'chunk-0',
  'chunk-1',
  'chunk-2',
  'chunk-3',
  'chunk-4',
]

test.describe('ReadableStream deserialization', () => {
  testWithHydration('promise data deserializes correctly', async ({ page }) => {
    await page.goto('/stream')

    await expect(page.getByTestId('promise-data')).toContainText(
      'promise-resolved',
      { timeout: 5000 },
    )
  })

  testWithHydration(
    'stream chunks deserialize in source order',
    async ({ page }) => {
      await page.goto('/stream')

      await expect(page.getByTestId('stream-complete')).toBeVisible({
        timeout: 10000,
      })

      const chunks = page
        .getByTestId('stream-data')
        .locator('[data-testid^="stream-chunk-"]')
      await expect(chunks).toHaveText(expectedStreamChunks)

      // This browser assertion covers deserialization and source order. The
      // raw `/deferred` assertion covers server-response and router ordering.
    },
  )

  testWithHydration(
    'client-side navigation to stream route works',
    async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Navigate via nav link
      await page.getByRole('link', { name: 'Stream' }).first().click()
      await expect(page).toHaveURL('/stream')

      await expect(page.getByTestId('stream-complete')).toBeVisible({
        timeout: 10000,
      })
    },
  )
})
