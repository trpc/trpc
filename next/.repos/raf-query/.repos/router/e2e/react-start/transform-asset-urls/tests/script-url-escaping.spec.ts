import { expect, test } from '@playwright/test'

for (const [name, scriptUrl] of [
  [
    'closing script tag',
    '</script><script>document.documentElement.setAttribute("data-asset-url-executed","yes")</script><script type="module">/*',
  ],
  [
    'quoted attribute',
    '"><script>document.documentElement.setAttribute("data-asset-url-executed","yes")</script><script src="',
  ],
] as const) {
  test(`transformed script URLs preserve a ${name} as attribute text`, async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ 'x-test-script-url': scriptUrl })
    // The URLs deliberately do not identify loadable modules. Keep the page's
    // real inline scripts enabled so an accidentally injected script would run.
    await page.route('**/*', (route) => {
      if (route.request().resourceType() === 'script') {
        return route.abort()
      }
      return route.continue()
    })

    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    await expect(page.getByTestId('home-heading')).toHaveText('Welcome Home')

    const sources = await page
      .locator('script[src]')
      .evaluateAll((scripts) =>
        scripts.map((script) => script.getAttribute('src')),
      )
    expect(sources).toContain(scriptUrl)
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-asset-url-executed',
      'yes',
    )
    expect(
      await page.locator('script:not([src])').allTextContents(),
    ).not.toContain(
      'document.documentElement.setAttribute("data-asset-url-executed","yes")',
    )
  })
}
