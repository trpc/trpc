import {
  STREAM_PART_SELECTOR,
  expect,
  test,
  testWithHydration,
} from '../../../streaming-ssr-assertions'

const runBufferReproduction =
  process.env.RUN_SSR_ROUTER_HTML_BUFFER_REPRO === 'true'

test.describe('SSR router HTML buffer', () => {
  test.skip(
    !runBufferReproduction,
    'The 17 MiB ASCII reproduction is intentionally opt-in: pnpm test:e2e:buffer-repro',
  )

  testWithHydration(
    'hydrates a large deferred loader payload from server state',
    async ({ page }) => {
      const response = await page.goto('/router-html-buffer')

      expect(response?.ok()).toBe(true)
      await expect(page.getByTestId('router-html-payload-length')).toHaveText(
        '17825792',
      )
      await expect(page.locator(STREAM_PART_SELECTOR)).toHaveCount(0)

      await page.getByTestId('router-html-payload-check').click()
      await expect(page.getByTestId('router-html-payload-result')).toHaveText(
        'server:17825792:x',
      )
    },
  )
})
