import { chromium, expect } from '@playwright/test'
import { preOptimizeDevServer, waitForServer } from '@tanstack/router-e2e-utils'
import { ssrStylesMode } from '../../env'

export default async function setup() {
  if (process.env.MODE !== 'dev') {
    return
  }

  const port = Number(process.env.E2E_APP_PORT ?? 0)
  const baseURL = `http://localhost:${port}`

  await waitForServer(baseURL)

  // Check cold SSR before the browser warmup can populate the client graph.
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ javaScriptEnabled: false })
    const backgroundAsset =
      ssrStylesMode !== 'disabled'
        ? page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname.includes('ssr-background'),
            { timeout: 60_000 },
          )
        : undefined
    await page.goto(baseURL, { timeout: 60_000 })
    await expect(page.getByTestId('home-heading')).toHaveText(
      'Dev SSR Styles Test',
      { timeout: 30_000 },
    )
    if (ssrStylesMode !== 'disabled') {
      expect((await backgroundAsset!).ok()).toBeTruthy()
      await expect(page.getByTestId('styled-box')).toHaveCSS(
        'background-color',
        'rgb(59, 130, 246)',
        { timeout: 30_000 },
      )
    }
  } finally {
    await browser.close()
  }

  await preOptimizeDevServer({ baseURL, readyTestId: 'home-heading' })
}
