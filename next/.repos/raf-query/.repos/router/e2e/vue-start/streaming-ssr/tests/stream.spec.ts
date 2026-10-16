import { expect, testWithHydration } from '../../../streaming-ssr-assertions'
import '../../../streaming-ssr-specs/stream'

testWithHydration(
  'reads a replacement stream after an active read',
  async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.getByRole('link', { name: 'Stream' }).first().click()
    await expect(page.getByTestId('stream-chunk-0')).toHaveText('chunk-0')
    await expect(page.getByTestId('stream-complete')).toHaveCount(0)

    await page.getByTestId('refresh-stream').click()

    const streamData = page.getByTestId('stream-data')
    await expect(streamData).toHaveAttribute('data-read-count', '2')
    await expect(page.getByTestId('stream-complete')).toBeVisible()
    await expect(
      streamData.locator('[data-testid^="stream-chunk-"]'),
    ).toHaveText(['chunk-0', 'chunk-1', 'chunk-2', 'chunk-3', 'chunk-4'])
  },
)
