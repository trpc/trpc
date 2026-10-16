import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { Page } from '@playwright/test'

async function reloadAfterStorageFailure(page: Page) {
  const errors: Array<string> = []
  page.on('pageerror', (error) => errors.push(error.message))
  const snapshot = await page.evaluate(async () => {
    let failures = 0
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (...args) {
      try {
        return setItem.apply(this, args)
      } catch (error) {
        failures++
        throw error
      }
    }
    const scrolled = new Promise<void>((resolve) =>
      addEventListener('scroll', () => resolve(), { once: true }),
    )
    scrollTo(0, 200)
    await scrolled
    // Handler integration; genuine reload handoff is covered by the Start suite.
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }))
    return { mode: history.scrollRestoration, failures }
  })
  expect(snapshot.failures).toBeGreaterThan(0)
  // Storage failure must still allow native fallback; failure to restore is not a requirement.
  expect(snapshot.mode).toBe('auto')
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByRole('heading', { name: 'Scroll Error Test' }),
  ).toBeVisible()
  expect(await page.evaluate(() => history.scrollRestoration)).toBe('manual')
  expect(errors).toEqual([])
}

test.describe('Scroll Restoration with Session Storage Error', () => {
  test('should not crash when sessionStorage.setItem throws an error', async ({
    page,
  }) => {
    await page.goto('/app/scroll-error')
    await page.waitForLoadState('networkidle')

    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error('Test Error')
      }
    })

    await reloadAfterStorageFailure(page)
  })

  test('should not crash when sessionStorage quota is exceeded', async ({
    page,
  }) => {
    await page.goto('/app/scroll-error')
    await page.waitForLoadState('networkidle')

    await page.evaluate(() => {
      let i = 0
      const chunk = 'x'.repeat(32)

      try {
        while (true) {
          sessionStorage.setItem(`key_${i}`, chunk)
          i += 1
        }
      } catch {
        console.log(`Stored ${i} keys in session storage`)
      }
    })

    await reloadAfterStorageFailure(page)
  })
})
