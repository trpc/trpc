import { defer, isAsyncGeneratorFunction, once, tryOrUndefined } from './function'

it('once', () => {
  const fn = vi.fn(() => ({}))
  const onceFn = once(fn)

  expect(onceFn()).toBe(fn.mock.results[0]!.value)
  expect(onceFn()).toBe(fn.mock.results[0]!.value)
  expect(onceFn()).toBe(fn.mock.results[0]!.value)
  expect(onceFn()).toBe(fn.mock.results[0]!.value)
  expect(onceFn()).toBe(fn.mock.results[0]!.value)

  expect(fn).toHaveBeenCalledTimes(1)
})

describe('defer', () => {
  it('with setTimeout', async () => {
    const callback1 = vi.fn()
    const callback2 = vi.fn()

    defer(callback1)
    callback2()

    expect(callback1).toHaveBeenCalledTimes(0)

    await new Promise(resolve => setTimeout(resolve, 100))

    expect(callback1).toHaveBeenCalledTimes(1)
    expect(callback2).toHaveBeenCalledBefore(callback1)
  })

  it('with setTimeout and delay', async ({ onTestFinished }) => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })

    const callback = vi.fn()

    defer(callback, 100)

    await vi.advanceTimersByTimeAsync(99)
    expect(callback).toHaveBeenCalledTimes(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('without setTimeout', async () => {
    const callback1 = vi.fn()
    const callback2 = vi.fn()

    const originalSetTimeout = globalThis.setTimeout
    ;(globalThis as any).setTimeout = undefined
    defer(callback1)
    globalThis.setTimeout = originalSetTimeout
    callback2()

    expect(callback1).toHaveBeenCalledTimes(0)

    await new Promise(resolve => setTimeout(resolve, 100))

    expect(callback1).toHaveBeenCalledTimes(1)
    expect(callback2).toHaveBeenCalledBefore(callback1)
  })
})

describe('tryOrUndefined', () => {
  it('returns the result', () => {
    expect(tryOrUndefined(() => 123)).toBe(123)
  })

  it('returns undefined on throw', () => {
    expect(tryOrUndefined(() => {
      throw new Error('TEST')
    })).toBeUndefined()
  })

  it('preserves falsy values', () => {
    expect(tryOrUndefined(() => false)).toBe(false)
    expect(tryOrUndefined(() => 0)).toBe(0)
    expect(tryOrUndefined(() => '')).toBe('')
    expect(tryOrUndefined(() => null)).toBeNull()
  })
})

describe('isAsyncGeneratorFunction', () => {
  it('returns true for async generator functions', () => {
    async function* gen() {}

    expect(isAsyncGeneratorFunction(gen)).toBe(true)
    expect(isAsyncGeneratorFunction(gen.bind(null))).toBe(true)
    expect(isAsyncGeneratorFunction(async function* () {})).toBe(true)
    expect(isAsyncGeneratorFunction({ async* method() {} }.method)).toBe(true)
  })

  it('returns false for anything else', () => {
    expect(isAsyncGeneratorFunction(function* () {})).toBe(false)
    expect(isAsyncGeneratorFunction(async () => {})).toBe(false)
    expect(isAsyncGeneratorFunction(() => {})).toBe(false)
    expect(isAsyncGeneratorFunction(class {})).toBe(false)
    expect(isAsyncGeneratorFunction((async function* () {})())).toBe(false)
    expect(isAsyncGeneratorFunction({})).toBe(false)
    expect(isAsyncGeneratorFunction(null)).toBe(false)
    expect(isAsyncGeneratorFunction(undefined)).toBe(false)
  })
})
