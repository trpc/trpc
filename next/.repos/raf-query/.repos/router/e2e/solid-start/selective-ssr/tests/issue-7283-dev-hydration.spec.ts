import { expect, test } from '@playwright/test'
import { devBaseURL } from '../dev-server'
import type { Page } from '@playwright/test'

// Regression test for https://github.com/TanStack/router/issues/7283
//
// Selective SSR routes (`ssr: false` / `ssr: 'data-only'`) that declare a
// `pendingComponent` must hydrate cleanly in DEV mode. Solid only validates
// hydration markers in dev, so the production webServer configured in
// playwright.config.ts masks the mismatch ("template is not a function",
// route never reaches its loaded component). Playwright therefore owns a
// separate `vite dev` server and drives the app against it.

function collectHydrationFailures(page: Page) {
  const failures: Array<string> = []
  const isHydrationFailure = (text: string) =>
    text.includes('template is not a function') ||
    text.includes("wasn't caught by any route") ||
    text.includes('Hydration Mismatch')
  page.on('pageerror', (err) => {
    if (isHydrationFailure(err.message)) failures.push(err.message)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const text = msg.text()
      if (isHydrationFailure(text)) failures.push(text)
    }
  })
  return failures
}

test.describe('dev-mode hydration of selective SSR routes with pendingComponent', () => {
  test.setTimeout(120_000)

  test('ssr:false route with pendingComponent hydrates cleanly and reaches its loaded component (issue #7283)', async ({
    page,
  }) => {
    const failures = collectHydrationFailures(page)

    await page.goto(`${devBaseURL}/ssr-false-pending-min`)

    // The loaded component is the issue oracle: main never reaches it.
    await expect(page.getByTestId('ssr-false-target')).toBeVisible({
      timeout: 15_000,
    })

    // No dev hydration mismatch may occur along the way.
    expect(failures).toEqual([])

    await expect(page.getByTestId('ssr-false-pending')).not.toBeAttached()

    const lifecycleEvents = await page.evaluate(() =>
      ((globalThis as any).__events ?? [])
        .map((event: { type: string }) => event.type)
        .filter((type: string) =>
          ['pending-mounted', 'pending-unmounted', 'target-mounted'].includes(
            type,
          ),
        ),
    )
    expect(lifecycleEvents.slice(-3)).toEqual([
      'pending-mounted',
      'pending-unmounted',
      'target-mounted',
    ])
  })

  test('data-only route with pendingComponent hydrates cleanly and reaches its loaded component (regression vs main)', async ({
    page,
  }) => {
    const failures = collectHydrationFailures(page)

    await page.goto(`${devBaseURL}/data-only-pending-component`)

    await expect(
      page.getByTestId('data-only-pending-component-pending'),
    ).toBeAttached()
    await expect(
      page.getByTestId('data-only-pending-component-ready-label'),
    ).toHaveText('OK - loader finished', { timeout: 15_000 })

    expect(failures).toEqual([])
  })
})
