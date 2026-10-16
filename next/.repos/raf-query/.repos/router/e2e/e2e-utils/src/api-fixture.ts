import { test as base } from '@playwright/test'
import { defineNetworkFixture } from '@msw/playwright'
import { apiHandlers } from './api-handlers'

// Opt in only for suites that consume the canned API. Playwright routing
// disables HTTP caching; other suites keep their normal browser behavior.
export const apiTest = base.extend<{ mockApi: void }>({
  mockApi: [
    async ({ context }, use) => {
      const network = defineNetworkFixture({ context, handlers: apiHandlers })
      await network.enable()
      await use()
      await network.disable()
    },
    { auto: true },
  ],
})
