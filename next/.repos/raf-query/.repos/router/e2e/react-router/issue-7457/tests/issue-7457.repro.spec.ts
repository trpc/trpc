import { expect, test } from '@playwright/test'

test('#7457: initial child redirect after async root beforeLoad does not blank', async ({
  page,
}) => {
  const pageErrors: Array<string> = []
  const consoleErrors: Array<string> = []
  page.on('pageerror', (error) =>
    pageErrors.push(error.message || String(error)),
  )
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')

  await expect(page).toHaveURL(/\/another$/)
  const target = page.getByText('Hello "/another"!')
  await expect
    .poll(async () => ({
      targetCount: await target.count(),
      pageErrors: [...pageErrors],
      consoleErrors: [...consoleErrors],
    }))
    .toEqual({ targetCount: 1, pageErrors: [], consoleErrors: [] })
  await expect(target).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => (globalThis as any).__pendingSeen))
    .toBe(true)
  await expect(page.getByTestId('app-pending')).not.toBeVisible()
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
