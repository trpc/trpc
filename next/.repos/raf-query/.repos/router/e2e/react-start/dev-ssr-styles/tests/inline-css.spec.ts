import { expect } from '@playwright/test'
import { DEV_STYLES_ATTR } from '@tanstack/router-core'
import { test } from '@tanstack/router-e2e-utils'
import { ssrStylesMode } from '../env'

test.describe('server inline CSS with layered imports', () => {
  test.skip(ssrStylesMode !== 'default', 'Requires the default dev stylesheet')
  test.use({ javaScriptEnabled: false })

  test('keeps layered inline imports out of the global dev stylesheet', async ({
    page,
  }) => {
    await page.goto('/inline-css')
    const embeddedCss = await page.getByTestId('embedded-css').textContent()
    for (const layer of ['theme', 'base', 'utilities']) {
      expect(embeddedCss).toContain(`@layer ${layer}`)
    }
    for (const marker of ['theme', 'preflight', 'utilities']) {
      expect(embeddedCss).toContain(`--embedded-${marker}-marker`)
    }

    const href = await page
      .locator(`link[${DEV_STYLES_ATTR}]`)
      .getAttribute('href')
    expect(href).toBeTruthy()
    const response = await page.request.get(new URL(href!, page.url()).href)
    expect(response.ok()).toBeTruthy()
    expect(await response.text()).not.toContain('--embedded-')

    const layout = page.getByTestId('inline-css-layout')
    await expect(layout).toHaveCSS('padding-top', '24px')
    await expect(layout).toHaveCSS('margin-top', '12px')
    await expect(layout).toHaveCSS('border-top-width', '3px')
  })
})
