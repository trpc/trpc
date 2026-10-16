import { writeFile } from 'node:fs/promises'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { scrollRestorationLifecycleTests } from '../../../scroll-restoration-lifecycle'

scrollRestorationLifecycleTests(test)

test('hands native scroll restoration back to the browser on reload', async ({
  page,
}, testInfo) => {
  const errors: Array<string> = []
  page.on('pageerror', (error) => errors.push(error.message))
  const key = 'test-scroll-pagehide'
  const token = testInfo.testId
  await page.addInitScript(() => {
    ;(window as any).__initialScrollRestoration = history.scrollRestoration
  })
  await page.goto('/')
  await page.getByRole('link', { name: '/reset-scroll-false-a' }).click()
  await page.waitForLoadState('networkidle')
  expect(await page.evaluate(() => history.scrollRestoration)).toBe('manual')

  const position = await page.evaluate(
    async ({ key, token }) => {
      sessionStorage.removeItem(key)
      const scrolled = new Promise<void>((resolve) => {
        addEventListener('scroll', () => resolve(), { once: true })
      })
      scrollTo(0, 500)
      await scrolled
      // Registered after router setup, so this observes the router's handoff.
      window.addEventListener(
        'pagehide',
        (event) => {
          sessionStorage.setItem(
            key,
            JSON.stringify({
              token,
              mode: history.scrollRestoration,
              persisted: (event as PageTransitionEvent).persisted,
              trusted: event.isTrusted,
              x: scrollX,
              y: scrollY,
            }),
          )
        },
        { once: true },
      )
      return { x: scrollX, y: scrollY }
    },
    { key, token },
  )
  expect(position.y).toBeGreaterThan(0)

  await page.reload()
  const observation = await page.evaluate(
    (key) => ({
      outgoing: JSON.parse(sessionStorage.getItem(key)!),
      initialMode: (window as any).__initialScrollRestoration,
    }),
    key,
  )
  const snapshotPath = testInfo.outputPath('reload-handoff.json')
  await writeFile(
    snapshotPath,
    JSON.stringify({ ...observation, errors }, null, 2),
  )
  await testInfo.attach('reload-handoff', {
    path: snapshotPath,
    contentType: 'application/json',
  })
  expect(observation.outgoing).toMatchObject({
    token,
    trusted: true,
    mode: 'auto',
  })
  expect(observation.initialMode).toBe('auto')
  expect(Math.abs(observation.outgoing.x - position.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(observation.outgoing.y - position.y)).toBeLessThanOrEqual(1)
  await expect
    .poll(() => page.evaluate(() => history.scrollRestoration))
    .toBe('manual')
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(position.y)
  expect(errors).toEqual([])
})
