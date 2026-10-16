import { expect, test } from '@playwright/test'

test('#8049: revisiting loaded split routes transitions without pending or blank paint', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const scope = globalThis as typeof globalThis & {
      __paintStates: Array<string>
      __recordPaintStates: boolean
    }
    scope.__paintStates = []
    scope.__recordPaintStates = false

    function recordPaintState() {
      if (scope.__recordPaintStates) {
        const state = document.querySelector('[data-state="home"]')
          ? 'home'
          : document.querySelector('[data-state="test"]')
            ? 'test'
            : document.querySelector('[data-state="pending"]')
              ? 'pending'
              : document.querySelector('[data-state="shell"]')
                ? 'shell'
                : 'empty'
        scope.__paintStates.push(state)
      }
      requestAnimationFrame(recordPaintState)
    }

    requestAnimationFrame(recordPaintState)
  })
  await page.goto('/')
  await expect(page.getByText('Home Page')).toBeVisible()
  await page.waitForTimeout(1_000)

  await page.getByRole('link', { name: 'Test' }).click()
  await expect(page.getByText('Test Page')).toBeVisible()
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByText('Home Page')).toBeVisible()

  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const scope = globalThis as typeof globalThis & {
          __paintStates: Array<string>
          __recordPaintStates: boolean
        }
        scope.__paintStates = []
        scope.__recordPaintStates = true
        requestAnimationFrame(() => resolve())
      }),
  )

  await page.getByRole('link', { name: 'Test' }).click()
  await expect(page.getByText('Test Page')).toBeVisible()
  const paintStates = await page.evaluate(
    () =>
      new Promise<Array<string>>((resolve) => {
        requestAnimationFrame(() => {
          const scope = globalThis as typeof globalThis & {
            __paintStates: Array<string>
            __recordPaintStates: boolean
          }
          scope.__recordPaintStates = false
          resolve(scope.__paintStates)
        })
      }),
  )

  expect(paintStates[0]).toBe('home')
  expect(paintStates).toContain('test')
  expect(paintStates).not.toContain('pending')
  expect(paintStates).not.toContain('shell')
  expect(paintStates).not.toContain('empty')
})
