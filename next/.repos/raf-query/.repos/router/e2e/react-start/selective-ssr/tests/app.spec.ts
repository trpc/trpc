import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

const testCount = 7

test.describe('selective ssr', () => {
  test('#7947: beforeLoad redirect on an ssr: false route does not cause a hydration error', async ({
    page,
  }) => {
    const browserErrors: Array<string> = []
    // React's default onRecoverableError reports through both channels,
    // depending on whether the development or production build is running.
    page.on('console', (message) => {
      if (message.type() === 'error') {
        browserErrors.push(message.text())
      }
    })
    page.on('pageerror', (error) => {
      browserErrors.push(error.message)
    })

    await page.goto('/issue-7947')

    await expect(page).toHaveURL(/\/issue-7947-target$/)
    await expect(page.getByTestId('issue-7947-target')).toBeVisible()

    const hydrationErrors = browserErrors.filter((error) =>
      /hydrat|did not match|server rendered HTML|Minified React error #(418|423|425)\b/i.test(
        error,
      ),
    )
    expect(hydrationErrors).toEqual([])
  })

  test('#4614: cached parent loader data does not cache its beforeLoad context', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByTestId('issue-4614-cached-link').hover()

    await expect
      .poll(() =>
        page.evaluate(() => (globalThis as any).__issue4614TargetBeforeLoad),
      )
      .not.toBeUndefined()

    const { rootBeforeLoads, targetBeforeLoad } = await page.evaluate(() => {
      const rootBeforeLoads =
        (globalThis as any).__issue4614RootBeforeLoads ?? []
      return {
        rootBeforeLoads,
        targetBeforeLoad: (globalThis as any).__issue4614TargetBeforeLoad,
      }
    })

    expect(rootBeforeLoads).toEqual([
      {
        cause: 'preload',
        preload: true,
        root: 'client',
        issue4614Context: 'client:cached',
      },
    ])
    expect(targetBeforeLoad).toEqual({
      cause: 'preload',
      preload: true,
      rootContext: 'client',
      issue4614Context: 'client:cached',
      scenario: 'cached',
    })
  })

  test('new loaderDeps match generation propagates fresh parent context to child (control)', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByTestId('issue-4614-reload-link').hover()

    await expect
      .poll(() =>
        page.evaluate(() => (globalThis as any).__issue4614RootBeforeLoads),
      )
      .toEqual([
        {
          cause: 'preload',
          preload: true,
          root: 'client',
          issue4614Context: 'client:reload',
        },
      ])
    await expect
      .poll(() =>
        page.evaluate(() => (globalThis as any).__issue4614TargetBeforeLoad),
      )
      .toEqual({
        cause: 'preload',
        preload: true,
        rootContext: 'client',
        issue4614Context: 'client:reload',
        scenario: 'reload',
      })
  })

  test('testcount matches', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByTestId('test-count')).toHaveText(`${testCount}`)
  })

  for (let i = 0; i < testCount; i++) {
    test(`run test ${i}`, async ({ page }) => {
      await page.goto('/')
      const testId = `testcase-${i}-link`
      await page.getByTestId(testId).click()

      // wait for page to be loaded by waiting for the leaf route to be rendered
      await expect(page.getByTestId('postId-heading')).toContainText('postId')

      // check expectations
      await Promise.all(
        ['root', 'posts', 'postId'].map(async (route) => {
          const expectedData = await page
            .getByTestId(`${route}-data-expected`)
            .textContent()
          expect(expectedData).not.toBeNull()
          await expect(page.getByTestId(`${route}-loader`)).toContainText(
            expectedData!,
          )
          await expect(page.getByTestId(`${route}-context`)).toContainText(
            expectedData!,
          )
        }),
      )
      await expect(page.getByTestId('router-isLoading')).toContainText('false')
      await expect(page.getByTestId('router-status')).toContainText('idle')
    })
  }
})
