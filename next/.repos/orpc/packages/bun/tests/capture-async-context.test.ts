import { AsyncLocalStorage } from 'node:async_hooks'
import { captureAsyncContext } from '@orpc/shared'
import { describe, expect, it } from 'bun:test'

describe('captureAsyncContext', () => {
  const storage = new AsyncLocalStorage<number>()

  it('runs the callback in the captured async context', async () => {
    const run = storage.run(1, () => captureAsyncContext())

    await storage.run(2, async () => {
      expect(await run(async () => storage.getStore())).toBe(1)
    })
  })

  // Bun 1.4.0 lost the async context of promise reactions once the code got hot: https://github.com/oven-sh/bun/issues/33806
  it('keeps each captured async context once the code gets hot', async () => {
    for (let round = 0; round < 100; round++) {
      const ids = Array.from({ length: 100 }, (_, i) => round * 100 + i)
      const runs = ids.map(id => storage.run(id, () => captureAsyncContext()))

      const stores = await storage.run(-1, () => Promise.all(runs.map(run => run(async () => storage.getStore()))))

      expect(stores).toEqual(ids)
    }
  })
})
