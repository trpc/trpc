import { expect } from '@playwright/test'
import { test } from './e2e-utils/src/fixture'
import type { Page } from '@playwright/test'

// Router transport markers, mirrored from router-core's hydration scripts.
// Keep every spec's protocol knowledge in this one place.
export const ROUTER_BOOTSTRAP_MARKER = '$_TSR.router='
export const ROUTER_STREAM_END_MARKER = '$_TSR.e()'
export const STREAM_BOUNDARY_MARKER = '$tsr-stream-boundary'
export const STREAM_PART_SELECTOR = '[data-tsr-stream-part]'
const LATE_RECORD_CLOSE = 'document.currentScript.remove()'

const immediateDataMarker = 'data-testid="immediate-data"'
const renderedDeferredMarker = 'data-testid="deferred-data"'

const browserUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

export async function expectDeferredRouteResponseOrder(
  baseURL: string | undefined,
) {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required')
  }

  const response = await fetch(new URL('/deferred', baseURL), {
    headers: {
      accept: 'text/html',
      'accept-encoding': 'identity',
      'user-agent': browserUserAgent,
    },
  })

  expect(response.status).toBe(200)
  expect(response.body).not.toBeNull()

  const html = await response.text()

  const responsePreview =
    html.length > 2000
      ? `${html.slice(0, 1000)}\n...\n${html.slice(-1000)}`
      : html

  const immediateDataIndex = html.indexOf(immediateDataMarker)
  const renderedDeferredIndex = html.indexOf(renderedDeferredMarker)
  expect(immediateDataIndex, responsePreview).toBeGreaterThanOrEqual(0)
  expect(renderedDeferredIndex, responsePreview).toBeGreaterThan(
    immediateDataIndex,
  )

  // SSR Query closes its request-local stream after renderer EOF. Its final
  // record is the deterministic late router output for this test.
  const boundaryIndex = html.indexOf(STREAM_BOUNDARY_MARKER)
  const routerEndIndex = html.indexOf(ROUTER_STREAM_END_MARKER)

  expect(boundaryIndex).toBeGreaterThan(-1)
  expect(boundaryIndex).toBeLessThan(routerEndIndex)
  expect(renderedDeferredIndex).toBeLessThan(routerEndIndex)

  expectCompleteRouterStreamBeforeDocumentCloses(html, renderedDeferredMarker)
}

export async function expectQueryHeavyRouteStreamOrder(
  baseURL: string | undefined,
) {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required')
  }

  const response = await fetch(new URL('/query-heavy', baseURL), {
    headers: {
      accept: 'text/html',
      'accept-encoding': 'identity',
      'user-agent': browserUserAgent,
    },
  })

  expect(response.status).toBe(200)
  const html = await response.text()

  expect(html).toContain('data-testid="fast-async-query-1"')
  expect(html).toContain('data-testid="slow-async-query-3"')
  expectCompleteRouterStreamBeforeDocumentCloses(html, '"slow-async-3"')
}

/** Asserts a route response carries the bootstrap, the boundary, and the end record. */
export function expectRouterHydrationMarkers(html: string) {
  expect(html).toContain(ROUTER_BOOTSTRAP_MARKER)
  expect(html).toContain(ROUTER_STREAM_END_MARKER)
  expect(html).toContain(STREAM_BOUNDARY_MARKER)
}

function expectCompleteRouterStreamBeforeDocumentCloses(
  html: string,
  payloadMarker: string,
) {
  const endIndex = html.indexOf(ROUTER_STREAM_END_MARKER)
  const payloadIndex = html.indexOf(payloadMarker)
  const scriptOpenIndex = html.lastIndexOf('<script', endIndex)
  const previousScriptCloseIndex = html.lastIndexOf('</script>', endIndex)
  const scriptCloseIndex = html.indexOf('</script>', endIndex)
  const bodyCloseIndex = html.indexOf('</body>', scriptCloseIndex)
  const htmlCloseIndex = html.indexOf('</html>', bodyCloseIndex)

  expect(endIndex).toBeGreaterThan(-1)
  expect(scriptOpenIndex).toBeGreaterThan(previousScriptCloseIndex)
  expect(scriptCloseIndex).toBeGreaterThan(endIndex)
  expect(payloadIndex).toBeGreaterThan(-1)
  expect(payloadIndex).toBeLessThan(endIndex)
  expect(html.slice(endIndex, scriptCloseIndex)).toContain(LATE_RECORD_CLOSE)
  expect(scriptCloseIndex).toBeLessThan(bodyCloseIndex)
  expect(bodyCloseIndex).toBeLessThan(htmlCloseIndex)
}

async function verifyHydration(
  page: Page,
  { timeout = 10_000 }: { timeout?: number } = {},
) {
  const button = page.getByTestId('hydration-check-btn')
  const status = page.getByTestId('hydration-status')

  await expect(button).toBeVisible()
  await expect(async () => {
    await button.click()
    await expect(status).toHaveText('hydrated', { timeout: 100 })
  }).toPass({ timeout })

  await expect(page.locator(STREAM_PART_SELECTOR)).toHaveCount(0)
  await expect(
    page.locator('script').filter({ hasText: STREAM_BOUNDARY_MARKER }),
  ).toHaveCount(0)
}

export { test }

export const testWithHydration = test.extend({
  page: async ({ page }, use) => {
    await use(page)
    await verifyHydration(page)
  },
})

export { expect }
