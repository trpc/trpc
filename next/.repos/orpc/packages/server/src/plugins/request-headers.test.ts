import type { RequestHeadersHandlerPluginContext } from './request-headers'
import { RPCHandler } from '../adapters/fetch/rpc-handler'
import { os } from '../builder'
import { RequestHeadersHandlerPlugin } from './request-headers'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requestHeadersHandlerPlugin', () => {
  it('injects request headers into context as Headers instance', async () => {
    const procedureHandler = vi.fn(() => 'pong')
    const procedure = os.$context<RequestHeadersHandlerPluginContext>().handler(procedureHandler)

    const handler = new RPCHandler(procedure, {
      plugins: [new RequestHeadersHandlerPlugin()],
    })

    const { response } = await handler.handle(new Request('https://example.com', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-custom-1': 'value1',
        'x-custom-2': 'value2',
        'authorization': 'Bearer token123',
      },
      body: JSON.stringify({ json: null }),
    }))

    expect(response).toBeDefined()
    expect(procedureHandler).toHaveBeenCalledOnce()
    const capturedHeaders = (procedureHandler as any).mock.calls[0]![0].context.reqHeaders
    expect(capturedHeaders).toBeInstanceOf(Headers)
    expect(capturedHeaders?.get('x-custom-1')).toBe('value1')
    expect(capturedHeaders?.get('x-custom-2')).toBe('value2')
    expect(capturedHeaders?.get('content-type')).toBe('application/json')
    expect(capturedHeaders?.get('authorization')).toBe('Bearer token123')
  })

  it('preserves existing reqHeaders when already provided in context', async () => {
    const procedure = os
      .$context<RequestHeadersHandlerPluginContext>()
      .handler(() => 'pong')

    const interceptor = vi.fn(({ next }: any) => next())

    const handler = new RPCHandler(procedure, {
      plugins: [new RequestHeadersHandlerPlugin()],
      interceptors: [interceptor],
    })

    const existingHeaders = new Headers({ 'existing-header': 'existing-value' })
    await handler.handle(new Request('https://example.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ json: null }),
    }), { context: { reqHeaders: existingHeaders } })

    expect(interceptor).toHaveBeenCalledOnce()
    expect(interceptor.mock.calls[0]![0].context.reqHeaders).toBe(existingHeaders)
  })
})
