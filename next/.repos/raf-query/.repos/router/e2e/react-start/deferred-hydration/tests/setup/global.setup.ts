import { preOptimizeDevServer, waitForServer } from '@tanstack/router-e2e-utils'

export default async function setup() {
  if (process.env.MODE !== 'dev') {
    return
  }

  const port = Number(process.env.E2E_APP_PORT ?? 0)
  const baseURL = `http://localhost:${port}`

  await waitForServer(baseURL)
  await preOptimizeDevServer({
    baseURL,
    readyTestId: 'home-heading',
    warmup: async (page) => {
      await page.goto(`${baseURL}/components`, {
        waitUntil: 'domcontentloaded',
      })
      await page.getByTestId('component-heading').waitFor({
        state: 'visible',
      })
      await page.waitForLoadState('networkidle')
    },
  })
}
