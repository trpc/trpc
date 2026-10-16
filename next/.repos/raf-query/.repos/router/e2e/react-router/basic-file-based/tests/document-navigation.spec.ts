import { expect } from '@playwright/test'
import { apiTest as test } from '@tanstack/router-e2e-utils'

const appPort = Number(process.env.E2E_APP_PORT ?? 0)
const adminHref = `http://127.0.0.1:${appPort}/external.html`

for (const role of ['button', 'link'] as const) {
  for (const { name, href, replace } of [
    { name: 'Navigate to admin', href: adminHref, replace: false },
    { name: 'Replace with admin', href: adminHref, replace: true },
    { name: 'Reload admin', href: adminHref, replace: false },
    { name: 'Navigate with external mask', href: adminHref, replace: false },
    { name: 'Replace with external mask', href: adminHref, replace: true },
    {
      name: 'Navigate to absolute href',
      href: `${adminHref}?value=a+b&value=a%20b#raw%2f`,
      replace: false,
    },
  ]) {
    test(`${role}: ${name}`, async ({ page }) => {
      const errors: Array<Error> = []
      page.on('pageerror', (error) => errors.push(error))
      await page.goto('/')
      await page.goto('/document-navigation')
      const historyLength = await page.evaluate(() => window.history.length)
      const response = page.waitForResponse(href.split('#')[0])

      const control = page.getByRole(role, { name, exact: true })
      if (role === 'link') {
        await expect(control).toHaveAttribute('href', href)
      }
      await control.click()

      expect((await response).request().isNavigationRequest()).toBe(true)
      await expect(page).toHaveURL(href)
      await expect(page.locator('body')).toHaveText('Hello World')
      // Cross-origin Links use native anchors, which push even with replace=true.
      const replacesHistory = role === 'button' && replace
      expect(await page.evaluate(() => window.history.length)).toBe(
        historyLength + (replacesHistory ? 0 : 1),
      )
      expect(errors).toEqual([])

      await page.goBack()

      await expect(page).toHaveURL(
        replacesHistory ? '/' : '/document-navigation',
      )
    })
  }

  test(`${role}: explicit reload resolves a raw relative href in the browser`, async ({
    page,
  }) => {
    await page.goto('/document-navigation')
    const response = page.waitForResponse((candidate) =>
      candidate.request().isNavigationRequest(),
    )

    await page
      .getByRole(role, { name: 'Reload relative href', exact: true })
      .click()

    expect((await response).request().resourceType()).toBe('document')
    await expect(page).toHaveURL('/?value=a+b&value=a%20b#raw%2f')
    await expect(page.getByRole('heading')).toContainText('Welcome Home!')
  })
}
