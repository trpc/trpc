import { preOptimizeDevServer, waitForServer } from '@tanstack/router-e2e-utils'

export default async function setup() {
  if (process.env.MODE !== 'dev') return

  const port = Number(process.env.E2E_APP_PORT ?? 0)
  const baseURL = `http://localhost:${port}`

  await waitForServer(baseURL)
  await preOptimizeDevServer({
    baseURL,
    readyTestId: 'home-heading',
    warmup: async (page) => {
      await page.getByTestId('link-about').click()
      await page.waitForURL('**/about')
      await page.getByTestId('about-heading').waitFor({ state: 'visible' })
      await page.waitForLoadState('networkidle')

      await page.getByTestId('link-home').click()
      await page.waitForURL(/\/([^/]*)(\/)?($|\?)/)
      await page.getByTestId('home-heading').waitFor({ state: 'visible' })
      await page.waitForLoadState('networkidle')
    },
  })
}
