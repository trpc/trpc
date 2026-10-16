import { expect } from '@playwright/test'
import { collectBrowserErrors, test } from '@tanstack/router-e2e-utils'

const buildUrl = (baseURL: string, pathname: string) =>
  baseURL.replace(/\/$/, '') + pathname

async function getStyle(page: any, testId: string, property: string) {
  return page.getByTestId(testId).evaluate((element: Element, prop: string) => {
    return getComputedStyle(element).getPropertyValue(prop)
  }, property)
}

async function getInlineCssTexts(page: any) {
  return page
    .locator('style')
    .evaluateAll((elements: Array<HTMLStyleElement>) =>
      elements
        .map((element) => element.textContent ?? '')
        .filter((text) => text.includes('background')),
    )
}

async function waitForHydration(page: any) {
  await page.waitForFunction(() => {
    return (window as any).__CSS_INLINE_E2E_HYDRATED__ === true
  })
}

test('SSR inlines active nested route CSS without manifest stylesheet links', async ({
  page,
  request,
  baseURL,
}) => {
  const errors: Array<string> = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })

  const url = buildUrl(baseURL!, '/app/dashboard')
  const response = await request.get(url)
  const html = await response.text()

  expect(response.ok()).toBe(true)
  expect(html).toContain('data-testid="dashboard-card"')
  expect(html).not.toContain('data-tanstack-router-inline-css')
  expect(html).not.toContain('data-allow-mismatch')
  expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/)
  expect(html).not.toContain('rel:"stylesheet"')
  const styleMatches = Array.from(
    html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g),
  )
  expect(styleMatches).toHaveLength(1)
  const inlineCss = styleMatches[0]?.[1]
  expect(inlineCss?.length).toBeGreaterThan(100)
  expect(inlineCss).not.toContain('\n')
  if (process.env.CSS_INLINE_TRANSFORM_ASSETS === 'true') {
    expect(inlineCss).toContain('cdn=1')
  } else {
    expect(inlineCss).not.toContain('cdn=1')
  }

  await page.goto(url)

  await expect(page.getByTestId('dashboard-card')).toBeVisible()
  await expect(page.getByTestId('nested-panel')).toBeVisible()

  await expect
    .poll(() => getStyle(page, 'shell', 'background-color'))
    .toBe('rgb(240, 249, 255)')
  await expect
    .poll(() => getStyle(page, 'app-layout', 'background-color'))
    .toBe('rgb(220, 252, 231)')
  await expect
    .poll(() => getStyle(page, 'dashboard-layout', 'border-left-color'))
    .toBe('rgb(124, 58, 237)')
  await expect
    .poll(() => getStyle(page, 'dashboard-card', 'background-color'))
    .toBe('rgb(254, 249, 195)')
  await expect
    .poll(() => getStyle(page, 'nested-panel', 'background-color'))
    .toBe('rgb(219, 234, 254)')

  const backgroundImage = await getStyle(
    page,
    'dashboard-card',
    'background-image',
  )
  expect(backgroundImage).not.toBe('none')

  const inlineStyleText = (await getInlineCssTexts(page))[0]
  expect(inlineStyleText?.length).toBeGreaterThan(100)

  expect(errors.filter((error) => /hydration|Hydration/.test(error))).toEqual(
    [],
  )
})

test('runtime request options can disable inline CSS', async ({
  page,
  request,
  baseURL,
}) => {
  const url = buildUrl(baseURL!, '/app/dashboard')
  const response = await request.get(url, {
    headers: {
      'x-inline-css': 'false',
    },
  })
  const html = await response.text()

  expect(response.ok()).toBe(true)
  expect(html).toMatch(/<link[^>]+rel="stylesheet"/)
  expect(html).not.toMatch(/<style\b[^>]*>[\s\S]*background[\s\S]*<\/style>/)

  await page.setExtraHTTPHeaders({
    'x-inline-css': 'false',
  })
  await page.goto(url)

  await expect(page.getByTestId('dashboard-card')).toBeVisible()
  await expect.poll(() => getInlineCssTexts(page)).toHaveLength(0)
  await expect
    .poll(() => getStyle(page, 'dashboard-card', 'background-color'))
    .toBe('rgb(254, 249, 195)')
})

test('client navigation keeps nested CSS module styles applied', async ({
  page,
  baseURL,
}) => {
  await page.goto(buildUrl(baseURL!, '/'))
  await waitForHydration(page)
  await page.getByTestId('nav-details').click()
  await page.waitForURL('**/app/dashboard/details')

  await expect(page.getByTestId('details-card')).toBeVisible()
  await expect
    .poll(() => getStyle(page, 'details-card', 'background-color'))
    .toBe('rgb(255, 237, 213)')
  await expect
    .poll(() => getStyle(page, 'nested-panel', 'border-top-color'))
    .toBe('rgb(37, 99, 235)')
})

test('client navigation preserves the SSR inline shell stylesheet', async ({
  page,
  baseURL,
}) => {
  await page.goto(buildUrl(baseURL!, '/'))
  await waitForHydration(page)

  const inlineStyle = page.locator('style[data-tsr-inline-css]')
  await expect(inlineStyle).toHaveCount(1)
  const original = await inlineStyle.evaluateHandle(
    (style: HTMLStyleElement) => {
      const mutations: Array<MutationRecord> = []
      const observer = new MutationObserver((records) => {
        mutations.push(...records)
      })
      observer.observe(style, {
        childList: true,
        characterData: true,
        subtree: true,
      })
      return { style, sheet: style.sheet, observer, mutations }
    },
  )

  await expect.poll(() => getInlineCssTexts(page)).toHaveLength(1)
  await expect
    .poll(() => getInlineCssTexts(page))
    .toEqual([expect.stringContaining('background')])
  await expect
    .poll(() => getStyle(page, 'shell', 'background-color'))
    .toBe('rgb(240, 249, 255)')

  await page.getByTestId('nav-dashboard').click()
  await page.waitForURL('**/app/dashboard')
  await expect(page).toHaveTitle('Inline CSS dashboard')
  await expect(page.getByTestId('dashboard-card')).toBeVisible()

  await page.getByTestId('nav-home').click()
  await expect(page).toHaveTitle('Inline CSS E2E')
  await expect(page.getByTestId('home')).toBeVisible()

  // #8250: unchanged CSS text can hide a redundant innerHTML write that
  // replaces the stylesheet or fails under Trusted Types. Observe native DOM
  // mutations and CSSOM identity without patching the innerHTML setter.
  expect(
    await original.evaluate(({ style, sheet, observer, mutations }) => {
      const mutationCount = mutations.length + observer.takeRecords().length
      observer.disconnect()
      return {
        connected: style.isConnected,
        sameSheet: style.sheet === sheet,
        mutationCount,
      }
    }),
  ).toEqual({ connected: true, sameSheet: true, mutationCount: 0 })
  await original.dispose()

  await expect.poll(() => getInlineCssTexts(page)).toHaveLength(1)
  await expect
    .poll(() => getInlineCssTexts(page))
    .toEqual([expect.stringContaining('background')])
  await expect
    .poll(() => getStyle(page, 'shell', 'background-color'))
    .toBe('rgb(240, 249, 255)')
})

test('client navigation preserves inline CSS with Trusted Types enforced', async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page)
  const csp = "require-trusted-types-for 'script'; trusted-types 'none'"
  await page.route('/', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': csp },
    })
  })

  const response = await page.goto('/')
  expect(response?.headers()['content-security-policy']).toBe(csp)
  expect(await page.evaluate(() => 'trustedTypes' in window)).toBe(true)
  await waitForHydration(page)

  const violations = await page.evaluateHandle(() => {
    const directives: Array<string> = []
    document.addEventListener('securitypolicyviolation', (event) => {
      directives.push(event.effectiveDirective)
    })
    return directives
  })

  await page.getByTestId('nav-dashboard').click()
  await expect(page).toHaveTitle('Inline CSS dashboard')
  await expect(page.getByTestId('dashboard-card')).toBeVisible()
  await expect
    .poll(() => getStyle(page, 'shell', 'background-color'))
    .toBe('rgb(240, 249, 255)')

  await page.getByTestId('nav-home').click()
  await expect(page).toHaveTitle('Inline CSS E2E')
  await expect(page.getByTestId('home')).toBeVisible()

  expect(await violations.jsonValue()).toEqual([])
  expect(browserErrors).toEqual([])
  await violations.dispose()
})
