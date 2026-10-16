import { expect, test } from '@playwright/test'

test('#7120 / #7367: a root redirect cannot commit a stale match during a view transition', async ({
  page,
}) => {
  const pageErrors: Array<string> = []
  const consoleErrors: Array<string> = []

  page.on('pageerror', (error) => {
    pageErrors.push(error.message || String(error))
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')

  const pending = page.getByTestId('root-pending')
  await expect(pending).toBeVisible()
  expect(await page.evaluate(() => window.redirectGate.waiting)).toBe(true)

  await page.evaluate(() => window.redirectGate.release())

  await expect(page).toHaveURL(/\/posts$/)
  await expect(
    page.getByRole('heading', { name: 'Posts loaded' }),
  ).toBeVisible()
  await expect(pending).not.toBeVisible()
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
