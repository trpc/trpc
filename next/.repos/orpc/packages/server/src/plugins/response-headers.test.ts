import type { ResponseHeadersHandlerPluginContext } from './response-headers'
import { RPCHandler } from '../adapters/fetch/rpc-handler'
import { os } from '../builder'
import { ResponseHeadersHandlerPlugin } from './response-headers'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('responseHeadersHandlerPlugin', () => {
  it('applies resHeaders set in middleware to the response', async () => {
    const procedure = os
      .$context<ResponseHeadersHandlerPluginContext>()
      .use(({ context, next }) => {
        context.resHeaders?.set('x-custom-1', 'value1')
        context.resHeaders?.set('x-custom-2', 'value2')
        return next()
      })
      .handler(() => 'pong')

    const handler = new RPCHandler(procedure, {
      plugins: [new ResponseHeadersHandlerPlugin()],
    })

    const { response } = await handler.handle(new Request('https://example.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ json: null }),
    }))

    expect(response).toBeDefined()
    expect(response!.headers.get('x-custom-1')).toBe('value1')
    expect(response!.headers.get('x-custom-2')).toBe('value2')
  })

  it('merges resHeaders into response headers', async () => {
    const procedure = os
      .$context<ResponseHeadersHandlerPluginContext>()
      .use(({ context, next }) => {
        context.resHeaders?.set('x-custom', 'from-middleware')
        return next()
      })
      .handler(() => 'pong')

    const handler = new RPCHandler(procedure, {
      plugins: [new ResponseHeadersHandlerPlugin()],
      routingInterceptors: [async ({ next }) => {
        const result = await next()

        if (!result.response) {
          return result
        }

        return {
          ...result,
          response: {
            ...result.response,
            headers: { 'x-custom': 'from-routing-interceptor' },
          },
        }
      }],
    })

    const { response } = await handler.handle(new Request('https://example.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ json: null }),
    }))

    expect(response).toBeDefined()
    expect(response!.headers.get('x-custom')).toBe('from-routing-interceptor, from-middleware')
  })

  it('copy resHeaders when it provided in context', async () => {
    const existingHeaders = new Headers({ 'existing-header': 'existing-value' })

    const procedure = os
      .$context<ResponseHeadersHandlerPluginContext>()
      .handler(({ context }) => {
        expect(context.resHeaders).not.toBe(existingHeaders)
        expect(context.resHeaders).toEqual(existingHeaders)
        context.resHeaders?.set('x-added-header', 'added-value')

        return 'pong'
      })

    const handler = new RPCHandler(procedure, {
      plugins: [new ResponseHeadersHandlerPlugin()],
    })

    const { response } = await handler.handle(new Request('https://example.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ json: null }),
    }), { context: { resHeaders: existingHeaders } })

    expect(response!.headers.get('existing-header')).toBe('existing-value')
    expect(response!.headers.get('x-added-header')).toBe('added-value')
  })

  it('does not interfere with unmatched requests', async () => {
    const procedure = os
      .$context<ResponseHeadersHandlerPluginContext>()
      .use(({ context, next }) => {
        context.resHeaders?.set('x-custom', 'value')
        return next()
      })
      .handler(() => 'pong')

    const handler = new RPCHandler(procedure, {
      plugins: [new ResponseHeadersHandlerPlugin()],
    })

    const { response } = await handler.handle(new Request('https://example.com/not-found'))
    expect(response).toBeUndefined()
  })
})
