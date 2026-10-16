import type { RateLimiter, RateLimitResult } from './types'
import { call, os, type } from '@orpc/server'
import { RATELIMIT_HANDLER_PLUGIN_CONTEXT_SYMBOL } from './handler-plugin'
import { ratelimit, RATELIMIT_MIDDLEWARE_CONTEXT_SYMBOL } from './middleware'

describe('ratelimit', () => {
  const createLimiter = (result: RateLimitResult): RateLimiter => ({
    limit: vi.fn().mockResolvedValue(result),
  })
  const success: RateLimitResult = { success: true, limit: 10, remaining: 5, reset: Date.now() + 60000 }

  it('applies rate limit successfully', async () => {
    const limiter = createLimiter(success)
    const mw = ratelimit({ limiter, key: 'key' })
    const procedure = os.use(mw).handler(() => 'ok')

    await expect(
      call(procedure, undefined, { context: {} }),
    ).resolves.toBe('ok')

    expect(limiter.limit).toHaveBeenCalledWith('key', {})
  })

  it('throws TOO_MANY_REQUESTS when limit exceeded', async () => {
    const reset = Date.now() + 60000
    const limiter = createLimiter({ success: false, limit: 10, remaining: 0, reset })
    const procedure = os.use(ratelimit({ limiter, key: 'key' })).handler(() => 'ok')

    await expect(
      call(procedure, undefined, { context: {} }),
    )
      .rejects
      .toMatchObject({ code: 'TOO_MANY_REQUESTS', data: { limit: 10, remaining: 0, reset } })

    expect(limiter.limit).toHaveBeenCalledWith('key', {})
  })

  it('can config limit weight', async () => {
    const limiter = createLimiter(success)
    const mw = ratelimit({ limiter, key: 'key', weight: 3 })
    const procedure = os.use(mw).handler(() => 'ok')

    await expect(
      call(procedure, undefined, { context: {} }),
    ).resolves.toBe('ok')

    expect(limiter.limit).toHaveBeenCalledWith('key', { weight: 3 })
  })

  it('limiter, key, weight can be async functions', async () => {
    const limiter = createLimiter(success)
    const limiterFn = vi.fn().mockResolvedValueOnce(limiter)
    const keyFn = vi.fn().mockResolvedValueOnce('key')
    const weightFn = vi.fn().mockResolvedValueOnce(3)
    const mw = ratelimit({ limiter: limiterFn, key: keyFn, weight: weightFn })
    const procedure = os.input(type<any>()).use(mw).handler(() => 'ok')

    await expect(
      call(procedure, '__input__', { context: { __context__: true }, path: ['__path__'] }),
    ).resolves.toBe('ok')

    expect(limiter.limit).toHaveBeenCalledWith('key', { weight: 3 })

    expect(limiterFn).toHaveBeenCalledTimes(1)
    expect(limiterFn).toHaveBeenCalledWith(
      expect.objectContaining({ procedure, path: ['__path__'], context: { __context__: true } }),
      '__input__',
    )

    expect(keyFn).toHaveBeenCalledTimes(1)
    expect(keyFn).toHaveBeenCalledWith(
      expect.objectContaining({ procedure, path: ['__path__'], context: { __context__: true } }),
      '__input__',
    )

    expect(weightFn).toHaveBeenCalledTimes(1)
    expect(weightFn).toHaveBeenCalledWith(
      expect.objectContaining({ procedure, path: ['__path__'], context: { __context__: true } }),
      '__input__',
    )
  })

  it('push result into handler plugin context if exists', async () => {
    const limiter = createLimiter(success)
    const ctx = { checks: [] }
    const procedure = os.use(ratelimit({ limiter, key: 'k' })).handler(() => 'ok')
    await call(procedure, undefined, {
      context: { [RATELIMIT_HANDLER_PLUGIN_CONTEXT_SYMBOL]: ctx },
      path: ['__path__'],
    })
    expect(ctx).toHaveProperty('checks', [{ path: ['__path__'], procedure, result: success }])
  })

  it('communicate with middleware context, and isolated', async () => {
    const limiter = createLimiter(success)
    const mw = ratelimit({ limiter, key: 'k', dedupe: false })
    const innerHandlerFn = vi.fn().mockReturnValue('in')
    const inner = os
      .use(mw)
      .handler(innerHandlerFn)
    const outer = os
      .use(mw)
      .handler(async ({ context }) => {
        return `out:${await call(inner, undefined, { context })}:${await call(inner, undefined, { context })}`
      })

    await call(outer, undefined, { context: {} })

    expect(limiter.limit).toHaveBeenCalledTimes(3)
    expect(innerHandlerFn).toHaveBeenCalledTimes(2)

    const context0 = innerHandlerFn.mock.calls[0]![0].context[RATELIMIT_MIDDLEWARE_CONTEXT_SYMBOL]
    const context1 = innerHandlerFn.mock.calls[1]![0].context[RATELIMIT_MIDDLEWARE_CONTEXT_SYMBOL]

    expect(context0).not.toBe(context1)
    expect(context0).toEqual(context1)
    expect(context0).toEqual({ applied: [{ limiter, key: 'k' }, { limiter, key: 'k' }] })
  })

  describe('dedupe', () => {
    it('deduplicates by default', async () => {
      const limiter = createLimiter(success)
      const mw = ratelimit({ limiter, key: 'k' })
      await call(os.use(mw).use(mw).handler(() => 'ok'), undefined, { context: {} })
      expect(limiter.limit).toHaveBeenCalledTimes(1)
    })

    it('skips dedupe when disabled', async () => {
      const limiter = createLimiter(success)
      const mw = ratelimit({ limiter, key: 'k', dedupe: false })
      await call(
        os.use(mw).use(mw).handler(() => 'ok'),
        undefined,
        { context: {} },
      )
      expect(limiter.limit).toHaveBeenCalledTimes(2)
    })

    it('dedupes only same limiter+key', async () => {
      const l1 = createLimiter(success)
      const l2 = createLimiter(success)
      const procedure = os
        .use(ratelimit({ limiter: l1, key: 'k' }))
        .use(ratelimit({ limiter: l1, key: 'diff' }))
        .use(ratelimit({ limiter: l2, key: 'k' }))
        .handler(() => 'ok')

      await call(procedure, undefined, { context: {} })
      expect(l1.limit).toHaveBeenCalledTimes(2)
      expect(l2.limit).toHaveBeenCalledTimes(1)
    })

    it('dedupes in nested calls', async () => {
      const limiter = createLimiter(success)
      const mw = ratelimit({ limiter, key: 'k' })
      const inner = os
        .use(mw)
        .handler(() => 'in')
      const outer = os
        .use(mw)
        .handler(async ({ context }) => `out:${await call(inner, undefined, { context })}`)

      await call(outer, undefined, { context: {} })
      expect(limiter.limit).toHaveBeenCalledTimes(1)
    })

    it('respects per-instance dedupe', async () => {
      const limiter = createLimiter(success)
      await call(
        os.use(ratelimit({ limiter, key: 'k', dedupe: true }))
          .use(ratelimit({ limiter, key: 'k', dedupe: false })).handler(() => 'ok'),
        undefined,
        { context: {} },
      )
      expect(limiter.limit).toHaveBeenCalledTimes(2)
    })
  })
})
