import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('a root pendingComponent preserves the SSR document during hydration', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { removed: false }
    ;(window as any).__hydration = state

    new MutationObserver((records) => {
      const ssrNode = (window as any).__ssrNode as Node | undefined
      if (!ssrNode) {
        return
      }

      for (const record of records) {
        for (const removedNode of record.removedNodes) {
          if (
            removedNode === ssrNode ||
            (removedNode instanceof Element && removedNode.contains(ssrNode))
          ) {
            state.removed = true
          }
        }
      }
    }).observe(document, { childList: true, subtree: true })
  })

  const response = await page.goto('/')
  expect(response?.ok()).toBe(true)
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true')

  expect(
    await page.evaluate(() => ({
      captured: !!(window as any).__ssrNode,
      removed: (window as any).__hydration.removed,
      replaced:
        (window as any).__ssrNode !==
        document.querySelector('[data-testid="ssr-node"]'),
    })),
  ).toEqual({
    captured: true,
    removed: false,
    replaced: false,
  })
})
