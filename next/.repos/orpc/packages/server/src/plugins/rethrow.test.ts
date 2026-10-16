import { COMMON_ERROR_STATUS_MAP, ORPCError } from '@orpc/client'
import { toArray } from '@orpc/shared'
import { RPCHandler } from '../adapters/fetch'
import { os } from '../builder'
import { RethrowHandlerPlugin } from './rethrow'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('rethrowHandlerPlugin', () => {
  const procedure_handler = vi.fn()
  const procedure = os.handler(procedure_handler)

  const filter = vi.fn(() => false)
  const interceptor = vi.fn(({ next }) => next())
  const handler = new RPCHandler(procedure, {
    allowMethods: ['GET'], // tests below send GET requests
    interceptors: [interceptor],
    plugins: [
      new RethrowHandlerPlugin({
        filter,
      }),
    ],
  })

  it('preserves the success response when no error is thrown', async () => {
    const { response } = await handler.handle(new Request('http://localhost'))
    expect(response?.status).toBe(200)
  })

  it('rethrows handler errors when the filter returns true', async () => {
    const error = new Error('__TEST__')
    procedure_handler.mockRejectedValueOnce(error)
    filter.mockReturnValueOnce(true)

    await expect(
      handler.handle(new Request('http://localhost'), { context: { context: true } }),
    ).rejects.toBe(error)

    expect(filter).toHaveBeenCalledTimes(1)
    expect(filter).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ context: expect.objectContaining({ context: true }) }),
    )
  })

  it('rethrows interceptor errors when the filter returns true', async () => {
    const error = new Error('__TEST__')
    interceptor.mockRejectedValueOnce(error)
    filter.mockReturnValueOnce(true)

    await expect(
      handler.handle(new Request('http://localhost'), { context: { context: true } }),
    ).rejects.toBe(error)

    expect(filter).toHaveBeenCalledTimes(1)
    expect(filter).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ context: expect.objectContaining({ context: true }) }),
    )
  })

  it('does not rethrow when the filter returns false', async () => {
    const error = new ORPCError('NOT_ACCEPTABLE')
    procedure_handler.mockRejectedValueOnce(error)
    filter.mockReturnValueOnce(false)

    const { response } = await handler.handle(new Request('http://localhost'))
    expect(response?.status).toBe(COMMON_ERROR_STATUS_MAP.NOT_ACCEPTABLE)
  })

  it('throws when another interceptor corrupts the plugin context', async () => {
    const interceptor = vi.fn(({ next, ...options }) => next({ ...options, context: {} }))
    const handler = new RPCHandler(procedure, {
      allowMethods: ['GET'],
      interceptors: [interceptor],
      plugins: [
        new RethrowHandlerPlugin({
          filter,
        }),
        {
          name: '~test',
          after: ['~rethrow'],
          init(options) {
            return {
              ...options,
              interceptors: [
                interceptor,
                ...toArray(options.interceptors),
              ],
            }
          },
        },
      ],
    })

    const { response } = await handler.handle(new Request('http://localhost'))
    expect(response?.status).toBe(500)

    expect(interceptor).toHaveBeenCalledTimes(1)
    await expect(interceptor.mock.results[0]?.value).rejects.toThrow('context has been corrupted or modified')
  })
})
