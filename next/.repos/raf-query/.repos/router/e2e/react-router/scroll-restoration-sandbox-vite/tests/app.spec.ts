import { expect } from '@playwright/test'
import { apiTest as test } from '@tanstack/router-e2e-utils'
import { linkOptions } from '@tanstack/react-router'
import { toRuntimePath } from '@tanstack/router-e2e-utils'

type ScrollPaintTestState = {
  sourceFrameScrollYs: Array<number>
  sourceWasReset: boolean
  destinationMounted: boolean
  destinationCommitScrollY: number | null
  destinationFrameScrollYs: Array<number>
  cleanup: () => void
}

declare global {
  interface Window {
    __scrollPaintTestState?: ScrollPaintTestState
  }
}

test('Smoke - Renders home', async ({ page }) => {
  await page.goto(toRuntimePath('/'))
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!' }),
  ).toBeVisible()
})

test('PUSH resets scroll before the destination can render a frame (#7815)', async ({
  page,
}) => {
  await page.goto(toRuntimePath('/issue-7040-source'))
  await expect(page.getByTestId('issue-7040-source-top')).toBeVisible()

  const sourceScrollY = await page.evaluate(async () => {
    window.scrollTo(0, 500)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    return window.scrollY
  })

  expect(sourceScrollY).toBeGreaterThan(0)

  await page.evaluate((expectedSourceScrollY) => {
    const root = document.querySelector('#app')
    if (!root) {
      throw new Error('App root not found')
    }

    const geometry = document.createElement('div')
    geometry.setAttribute('aria-hidden', 'true')
    geometry.style.height = `${window.innerHeight + expectedSourceScrollY + 100}px`
    geometry.style.pointerEvents = 'none'
    geometry.style.width = '1px'
    document.body.append(geometry)

    const state: ScrollPaintTestState = {
      sourceFrameScrollYs: [],
      sourceWasReset: false,
      destinationMounted: false,
      destinationCommitScrollY: null,
      destinationFrameScrollYs: [],
      cleanup: () => {},
    }

    const getDestinationHeading = () =>
      Array.from(document.querySelectorAll('h3')).find(
        (heading) => heading.textContent === 'normal-page',
      )

    const commitObserver = new MutationObserver(() => {
      const destinationHeading = getDestinationHeading()

      if (!destinationHeading) {
        return
      }

      commitObserver.disconnect()
      state.destinationMounted = true
      state.destinationCommitScrollY = window.scrollY
    })

    commitObserver.observe(root, { childList: true, subtree: true })

    const handleScroll = () => {
      if (
        document.querySelector('[data-testid="issue-7040-source-top"]') &&
        Math.abs(window.scrollY - expectedSourceScrollY) > 1
      ) {
        state.sourceWasReset = true
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })

    const originalScrollTo = window.scrollTo
    window.scrollTo = ((...args: Array<unknown>) => {
      const requestedTop =
        typeof args[0] === 'number'
          ? args[1]
          : typeof args[0] === 'object' && args[0] !== null
            ? (args[0] as ScrollToOptions).top
            : undefined
      if (
        typeof requestedTop === 'number' &&
        Math.abs(requestedTop - expectedSourceScrollY) > 1 &&
        document.querySelector('[data-testid="issue-7040-source-top"]')
      ) {
        state.sourceWasReset = true
      }
      Reflect.apply(originalScrollTo, window, args)
    }) as typeof window.scrollTo

    let animationFrameId = 0
    const recordFrame = () => {
      if (getDestinationHeading()) {
        state.destinationFrameScrollYs.push(window.scrollY)
      } else if (
        document.querySelector('[data-testid="issue-7040-source-top"]')
      ) {
        state.sourceFrameScrollYs.push(window.scrollY)
      }
      animationFrameId = requestAnimationFrame(recordFrame)
    }
    animationFrameId = requestAnimationFrame(recordFrame)

    state.cleanup = () => {
      commitObserver.disconnect()
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('scroll', handleScroll)
      window.scrollTo = originalScrollTo
      geometry.remove()
      delete window.__scrollPaintTestState
    }
    window.__scrollPaintTestState = state
  }, sourceScrollY)

  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      }),
  )
  expect(await page.evaluate(() => window.scrollY)).toBe(sourceScrollY)

  await page
    .getByRole('link', { name: 'Head-/normal-page' })
    .dispatchEvent('click')

  await page.waitForFunction(() => {
    const state = window.__scrollPaintTestState
    if (!state?.destinationMounted) {
      return false
    }

    const lastFrames = state.destinationFrameScrollYs.slice(-2)
    return (
      lastFrames.length === 2 &&
      lastFrames.every((scrollY) => Math.abs(scrollY) <= 1)
    )
  })

  const observation = await page.evaluate(() => {
    const state = window.__scrollPaintTestState
    if (!state) {
      throw new Error('Scroll paint observer not found')
    }

    return {
      sourceFrameScrollYs: state.sourceFrameScrollYs,
      sourceWasReset: state.sourceWasReset,
      destinationCommitScrollY: state.destinationCommitScrollY,
      destinationFrameScrollYs: state.destinationFrameScrollYs,
      destinationMaxScrollY:
        document.documentElement.scrollHeight - window.innerHeight,
      finalScrollY: window.scrollY,
    }
  })

  expect(observation.sourceFrameScrollYs.length).toBeGreaterThan(0)
  expect(
    observation.sourceFrameScrollYs.every(
      (scrollY) => Math.abs(scrollY - sourceScrollY) <= 1,
    ),
  ).toBe(true)
  expect(observation.sourceWasReset).toBe(false)
  expect(observation.destinationMaxScrollY).toBeGreaterThanOrEqual(
    sourceScrollY,
  )
  expect(observation.finalScrollY).toBe(0)
  expect(observation.destinationFrameScrollYs.length).toBeGreaterThanOrEqual(2)
  expect(
    observation.destinationFrameScrollYs.every(
      (scrollY) => Math.abs(scrollY) <= 1,
    ),
    `Destination paint opportunities: ${observation.destinationFrameScrollYs.join(', ')}, commit: ${observation.destinationCommitScrollY}, final: ${observation.finalScrollY}`,
  ).toBe(true)
})

test('restores the prior scroll position after browser back then forward', async ({
  page,
}) => {
  await page.goto(toRuntimePath('/'))
  await page.getByRole('link', { name: 'Head-/normal-page' }).click()
  await page.waitForURL('**/normal-page')
  await expect(page.getByTestId('at-the-top')).toBeInViewport()

  const scrollY = await page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight)
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    return window.scrollY
  })

  expect(scrollY).toBeGreaterThan(0)
  await expect(page.getByTestId('at-the-bottom')).toBeInViewport()

  await page.goBack()
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!' }),
  ).toBeVisible()

  await page.goForward()
  await page.waitForURL('**/normal-page')
  await page.waitForFunction(
    (expectedScrollY) => Math.abs(window.scrollY - expectedScrollY) <= 2,
    scrollY,
  )
  await expect(page.getByTestId('at-the-bottom')).toBeInViewport()
})

test('restores the prior scroll position after browser back navigation', async ({
  page,
}) => {
  await page.goto(toRuntimePath('/normal-page'))
  await expect(page.getByTestId('at-the-top')).toBeInViewport()

  const scrollY = await page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight)
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    return window.scrollY
  })

  expect(scrollY).toBeGreaterThan(0)
  await expect(page.getByTestId('at-the-bottom')).toBeInViewport()

  await page.getByRole('link', { name: 'Foot-/', exact: true }).click()
  await page.waitForURL('**/')
  await expect(
    page.getByRole('heading', { name: 'Welcome Home!' }),
  ).toBeVisible()

  await page.goBack()
  await page.waitForURL('**/normal-page')
  await page.waitForFunction(
    (expectedScrollY) => Math.abs(window.scrollY - expectedScrollY) <= 2,
    scrollY,
  )
  await expect(page.getByTestId('at-the-bottom')).toBeInViewport()
})

const pages = [
  linkOptions({ to: '/normal-page' }),
  linkOptions({ to: '/lazy-page' }),
  linkOptions({ to: '/virtual-page' }),
  linkOptions({ to: '/lazy-with-loader-page' }),
  linkOptions({ to: '/page-with-search', search: { where: 'footer' } }),
] as const

pages.forEach((options, index) => {
  const from = index === 0 ? pages[1].to : pages[0].to
  test(`On navigate from ${from} to ${options.to} (from the footer), scroll should be at top`, async ({
    page,
  }) => {
    await page.goto(toRuntimePath(from))
    const link = page.getByRole('link', { name: `Foot-${options.to}` })
    await link.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await link.click()
    await expect(page.getByTestId('at-the-top')).toBeInViewport()
  })
})

// Test for scroll related stuff
pages.forEach((options) => {
  test(`On navigate to ${options.to} (from the header), scroll should be at top`, async ({
    page,
  }) => {
    await page.goto(toRuntimePath('/'))
    await page.getByRole('link', { name: `Head-${options.to}` }).click()
    await expect(page.getByTestId('at-the-top')).toBeInViewport()
  })

  // scroll should be at the bottom on navigation after the page is loaded
  test(`On navigate via index page tests to ${options.to}, scroll should resolve at the bottom`, async ({
    page,
  }) => {
    await page.goto(toRuntimePath('/'))
    await page
      .getByRole('link', { name: `${options.to}#at-the-bottom` })
      .click()
    await expect(page.getByTestId('at-the-bottom')).toBeInViewport()
  })

  // scroll should be at the bottom on first load
  test(`On first load of ${options.to}, scroll should resolve resolve at the bottom`, async ({
    page,
  }) => {
    let url: string = options.to
    if ('search' in options) {
      url = `${url}?where=${options.search.where}`
    }
    await page.goto(toRuntimePath(`${url}#at-the-bottom`))
    await expect(page.getByTestId('at-the-bottom')).toBeInViewport()
  })
})
