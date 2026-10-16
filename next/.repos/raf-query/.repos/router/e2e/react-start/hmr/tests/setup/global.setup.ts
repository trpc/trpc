import { preOptimizeDevServer, waitForServer } from '@tanstack/router-e2e-utils'

export default async function setup() {
  const port = Number(process.env.E2E_APP_PORT ?? 0)
  const baseURL = `http://localhost:${port}`

  await waitForServer(baseURL)
  await preOptimizeDevServer({
    baseURL,
    readyTestId: 'hydrated',
  })
}
