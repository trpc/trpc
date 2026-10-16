import queryString from 'node:querystring'
import { expect } from '@playwright/test'
import { apiTest as test } from '@tanstack/router-e2e-utils'
import combinateImport from 'combinate'

// somehow playwright does not correctly import default exports
const combinate = (combinateImport as any).default as typeof combinateImport

const PORT = Number(process.env.E2E_APP_PORT ?? 0)
const EXTERNAL_ORIGIN = `http://127.0.0.1:${PORT}`

test.describe('redirects', () => {
  const internalNavigationTestMatrix = combinate({
    thrower: ['beforeLoad', 'loader'] as const,
    reloadDocument: [false, true] as const,
    preload: [false, true] as const,
  })

  internalNavigationTestMatrix.forEach(
    ({ thrower, reloadDocument, preload }) => {
      test(`internal target, navigation: thrower: ${thrower}, reloadDocument: ${reloadDocument}, preload: ${preload}`, async ({
        page,
      }) => {
        await page.waitForLoadState('networkidle')
        await page.goto(
          `/redirect/internal${preload === false ? '?preload=false' : ''}`,
        )
        const link = page.getByTestId(
          `via-${thrower}${reloadDocument ? '-reloadDocument' : ''}`,
        )

        await page.waitForLoadState('networkidle')
        let requestHappened = false

        const requestPromise = new Promise<void>((resolve) => {
          page.on('request', (request) => {
            if (
              request.url() === 'https://jsonplaceholder.typicode.com/posts'
            ) {
              requestHappened = true
              resolve()
            }
          })
        })
        await link.focus()

        const expectRequestHappened = preload && !reloadDocument
        const timeoutPromise = new Promise((resolve) =>
          setTimeout(resolve, expectRequestHappened ? 5000 : 500),
        )
        await Promise.race([requestPromise, timeoutPromise])
        await page.waitForLoadState('networkidle')
        expect(requestHappened).toBe(expectRequestHappened)
        await link.click()
        let fullPageLoad = false
        page.on('domcontentloaded', () => {
          fullPageLoad = true
        })

        const url = `http://localhost:${PORT}/posts`

        await page.waitForURL(url)
        expect(page.url()).toBe(url)
        await expect(page.getByTestId('PostsIndexComponent')).toBeInViewport()
        expect(fullPageLoad).toBe(reloadDocument)
      })
    },
  )

  const internalDirectVisitTestMatrix = combinate({
    thrower: ['beforeLoad', 'loader'] as const,
    reloadDocument: [false, true] as const,
  })

  internalDirectVisitTestMatrix.forEach(({ thrower, reloadDocument }) => {
    test(`internal target, direct visit: thrower: ${thrower}, reloadDocument: ${reloadDocument}`, async ({
      page,
    }) => {
      await page.waitForLoadState('networkidle')

      await page.goto(`/redirect/internal/via-${thrower}`)

      const url = `http://localhost:${PORT}/posts`

      await page.waitForURL(url)
      expect(page.url()).toBe(url)
      await page.waitForLoadState('networkidle')
      await expect(page.getByTestId('PostsIndexComponent')).toBeInViewport()
    })
  })

  const externalTestMatrix = combinate({
    scenario: ['navigate', 'direct_visit'] as const,
    thrower: ['beforeLoad', 'loader'] as const,
  })

  externalTestMatrix.forEach(({ scenario, thrower }) => {
    test(`external target: scenario: ${scenario}, thrower: ${thrower}`, async ({
      page,
    }) => {
      await page.waitForLoadState('networkidle')

      const q = queryString.stringify({
        externalHost: `${EXTERNAL_ORIGIN}/`,
      })
      if (scenario === 'navigate') {
        await page.goto(`/redirect/external?${q}`)
        await page.getByTestId(`via-${thrower}`).click()
      } else {
        await page.goto(`/redirect/external/via-${thrower}?${q}`)
      }

      const url = `${EXTERNAL_ORIGIN}/`

      await page.waitForURL(url)
      expect(page.url()).toBe(url)
    })
  })

  test('regression test for #3097', async ({ page }) => {
    await page.goto(`/redirect/preload/first`)
    const link = page.getByTestId(`link`)
    await link.focus()
    await link.click()
    await page.waitForURL('/redirect/preload/third')
    await expect(page.getByTestId(`third`)).toBeInViewport()
  })
})
