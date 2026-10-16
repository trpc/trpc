import { expect } from '@playwright/test'
import { DEV_STYLES_ATTR } from '@tanstack/router-core'
import { test } from '@tanstack/router-e2e-utils'

const whitelistErrors = [
  'Failed to load resource: net::ERR_NAME_NOT_RESOLVED',
  'Failed to load resource: the server responded with a status of 504',
]

test.describe('dev SSR styles', () => {
  test.use({ whitelistErrors })

  test.describe('with JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false, whitelistErrors })

    test('includes a Vue SFC style block during SSR', async ({ page }) => {
      await page.goto('/')

      const element = page.getByTestId('styled-box')
      await expect(element).toBeVisible()
      await expect(element).toHaveCSS('background-color', 'rgb(126, 34, 206)')

      const href = await page
        .locator(`link[${DEV_STYLES_ATTR}]`)
        .getAttribute('href')
      expect(href).toBeTruthy()

      const response = await page.request.get(new URL(href!, page.url()).href)
      expect(response.ok()).toBeTruthy()
      const css = await response.text()
      expect(css).toContain('--vue-sfc-style-marker')
      expect(css).toMatch(
        /\/src\/components\/SfcStyledBox\.vue\?vue&type=style[^\n]*&lang\.css/,
      )
    })
  })

  test('keeps CSS output stable after client modules load', async ({
    page,
  }) => {
    const initialResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/@tanstack-start/styles.css'),
    )
    await page.goto('/')
    await expect(page.getByTestId('styled-box')).toBeVisible()
    const initialResponse = await initialResponsePromise
    expect(initialResponse.ok()).toBeTruthy()
    const initialCss = await initialResponse.text()

    const reloadedResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/@tanstack-start/styles.css'),
    )
    await page.reload()
    await expect(page.getByTestId('styled-box')).toBeVisible()
    const reloadedResponse = await reloadedResponsePromise
    expect(reloadedResponse.ok()).toBeTruthy()
    const reloadedCss = await reloadedResponse.text()

    expect(reloadedCss).toBe(initialCss)
  })
})
