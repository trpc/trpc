import { ORPCError, os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { RATELIMIT_HANDLER_PLUGIN_CONTEXT_SYMBOL, RateLimitHandlerPlugin } from './handler-plugin'

describe('ratelimitHandlerPlugin', () => {
  const handlerFn = vi.fn()
  const procedure = os.handler(handlerFn)
  const handler = new RPCHandler(procedure, {
    allowMethods: ['GET'], // tests below send GET requests
    plugins: [
      new RateLimitHandlerPlugin(),
    ],
  })

  it('adds rate limit headers to a successful response after a limit check', async () => {
    const reset = Date.now() + 60000

    handlerFn.mockImplementationOnce(({ context, path, procedure }) => {
      context[RATELIMIT_HANDLER_PLUGIN_CONTEXT_SYMBOL].checks.push({
        path,
        procedure,
        result: {
          success: true,
          limit: 100,
          remaining: 50,
          reset,
        },
      })
    })

    const { response } = await handler.handle(new Request('http://localhost:3000'))

    expect(response!.headers.get('ratelimit-limit')).toBe('100')
    expect(response!.headers.get('ratelimit-remaining')).toBe('50')
    expect(response!.headers.get('ratelimit-reset')).toBe(reset.toString())
    expect(response!.headers.get('retry-after')).toBe(null)
  })

  it('adds retry-after when a request is rejected for exceeding the limit', async () => {
    const reset = Date.now() + 60000

    handlerFn.mockImplementationOnce(({ context, path, procedure }) => {
      context[RATELIMIT_HANDLER_PLUGIN_CONTEXT_SYMBOL].checks.push({
        path,
        procedure,
        result: {
          success: false,
          limit: 100,
          remaining: 50,
          reset,
        },
      })

      throw new ORPCError('TOO_MANY_REQUESTS')
    })

    const { response } = await handler.handle(new Request('http://localhost:3000'))

    expect(response!.headers.get('ratelimit-limit')).toBe('100')
    expect(response!.headers.get('ratelimit-remaining')).toBe('50')
    expect(response!.headers.get('ratelimit-reset')).toBe(reset.toString())
    expect(response!.headers.get('retry-after')).toBe('60') // 60s
  })

  it('skips rate limit headers when no limit check ran for the request', async () => {
    const { response } = await handler.handle(new Request('http://localhost:3000'))

    expect(response!.headers.get('ratelimit-limit')).toBe(null)
    expect(response!.headers.get('ratelimit-remaining')).toBe(null)
    expect(response!.headers.get('ratelimit-reset')).toBe(null)
    expect(response!.headers.get('retry-after')).toBe(null)
  })

  it('uses the most restrictive limit when multiple checks run for one request', async () => {
    const reset = Date.now() + 60000

    handlerFn.mockImplementationOnce(({ context, path, procedure }) => {
      context[RATELIMIT_HANDLER_PLUGIN_CONTEXT_SYMBOL].checks.push({
        path,
        procedure,
        result: {
          success: false,
        },
      })

      context[RATELIMIT_HANDLER_PLUGIN_CONTEXT_SYMBOL].checks.push({
        path,
        procedure,
        result: {
          success: false,
        },
      })

      context[RATELIMIT_HANDLER_PLUGIN_CONTEXT_SYMBOL].checks.push({
        path,
        procedure,
        result: {
          success: false,
          limit: 100,
          remaining: 3,
          reset,
        },
      })

      context[RATELIMIT_HANDLER_PLUGIN_CONTEXT_SYMBOL].checks.push({
        path,
        procedure,
        result: {
          success: false,
          limit: 100,
          remaining: 2,
          reset,
        },
      })

      // remaining is lowest but success: true so it still low priority to pick
      context[RATELIMIT_HANDLER_PLUGIN_CONTEXT_SYMBOL].checks.push({
        path,
        procedure,
        result: {
          success: true,
          limit: 100,
          remaining: 1,
          reset,
        },
      })
    })

    const { response } = await handler.handle(new Request('http://localhost:3000'))

    expect(response!.headers.get('ratelimit-limit')).toBe('100')
    expect(response!.headers.get('ratelimit-remaining')).toBe('2')
    expect(response!.headers.get('ratelimit-reset')).toBe(reset.toString())
    expect(response!.headers.get('retry-after')).toBe(null)
  })
})
