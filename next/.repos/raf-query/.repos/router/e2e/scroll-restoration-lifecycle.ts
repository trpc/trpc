import { expect } from '@playwright/test'

// These exercise browser lifecycle handlers, not actual BFCache navigation.
export function scrollRestorationLifecycleTests(
  test: typeof import('./e2e-utils/src/fixture').test,
) {
  test.beforeEach(async ({ page }) => {
    await page.goto('/normal-page')
    await expect
      .poll(() => page.evaluate(() => history.scrollRestoration))
      .toBe('manual')
    await page.waitForLoadState('networkidle')
  })

  for (const persisted of [false, true]) {
    test(`pagehide hands control back with persisted=${persisted}`, async ({
      page,
    }) => {
      const mode = await page.evaluate((persisted) => {
        dispatchEvent(new PageTransitionEvent('pagehide', { persisted }))
        return history.scrollRestoration
      }, persisted)
      expect(mode).toBe('auto')
    })

    test(`pageshow reclaims control only with persisted=${persisted}`, async ({
      page,
    }) => {
      const mode = await page.evaluate((persisted) => {
        // Model the state left by pagehide before the document resumes.
        history.scrollRestoration = 'auto'
        dispatchEvent(new PageTransitionEvent('pageshow', { persisted }))
        return history.scrollRestoration
      }, persisted)
      expect(mode).toBe(persisted ? 'manual' : 'auto')
    })
  }

  test('repeats the handoff when a cached document resumes more than once', async ({
    page,
  }) => {
    const modes = await page.evaluate(() => {
      const modes: Array<ScrollRestoration> = []
      for (let i = 0; i < 3; i++) {
        dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
        modes.push(history.scrollRestoration)
        dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
        modes.push(history.scrollRestoration)
      }
      return modes
    })
    expect(modes).toEqual([
      'auto',
      'manual',
      'auto',
      'manual',
      'auto',
      'manual',
    ])
  })
}
