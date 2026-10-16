import { afterEach, expect, test, vi } from 'vitest'
import { hydrateStart } from '../hydrateStart'

const coreHydrateStart = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/start-client-core/client', () => ({
  hydrateStart: coreHydrateStart,
}))

afterEach(() => {
  delete window.$_TSR
  coreHydrateStart.mockReset()
})

test('signals streaming cleanup after hydration succeeds', async () => {
  const router = {}
  coreHydrateStart.mockResolvedValue(router)
  const hydrated = vi.fn()
  window.$_TSR = { h: hydrated } as any

  await expect(hydrateStart()).resolves.toBe(router)
  expect(hydrated).toHaveBeenCalledTimes(1)
})

test('signals streaming cleanup without hiding a hydration failure', async () => {
  const error = new Error('hydration failed')
  coreHydrateStart.mockRejectedValue(error)
  const hydrated = vi.fn()
  window.$_TSR = { h: hydrated } as any

  await expect(hydrateStart()).rejects.toBe(error)
  expect(hydrated).toHaveBeenCalledTimes(1)
})
