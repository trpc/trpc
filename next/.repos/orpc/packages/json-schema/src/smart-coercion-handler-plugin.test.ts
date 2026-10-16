import { oc } from '@orpc/contract'
import z from 'zod'
import { SmartCoercionHandlerPlugin } from './smart-coercion-handler-plugin'

describe('smartCoercionHandlerPlugin', () => {
  it('prepends its interceptor and skips coercion when input schemas are missing', async () => {
    const existingInterceptor = vi.fn()
    const plugin = new SmartCoercionHandlerPlugin()

    const options = plugin.init({ clientInterceptors: [existingInterceptor] } as any)

    expect(options.clientInterceptors).toHaveLength(2)
    expect(options.clientInterceptors?.[1]).toBe(existingInterceptor)

    const next = vi.fn().mockResolvedValue('handled')

    await expect(options.clientInterceptors?.[0]?.({
      procedure: oc,
      input: { value: '1' },
      next,
    } as any)).resolves.toBe('handled')

    expect(next).toHaveBeenCalledOnce()
    expect(next).toHaveBeenCalledWith()
  })

  it('coerces input schemas and reuses converted schemas from the cache', async () => {
    const plugin = new SmartCoercionHandlerPlugin()

    const procedure = oc
      .input(z.looseObject({ number: z.number() }))
      .input(z.looseObject({ boolean: z.boolean() }))

    const options = plugin.init({} as any)
    const interceptor = options.clientInterceptors?.[0]
    const next = vi.fn().mockResolvedValue('handled')

    await expect(interceptor?.({
      procedure,
      input: { number: '123', boolean: 'true' },
      next,
    } as any)).resolves.toBe('handled')

    await expect(interceptor?.({
      procedure,
      input: { number: '456', boolean: 'off' },
      next,
    } as any)).resolves.toBe('handled')

    expect(next).toHaveBeenNthCalledWith(1, { procedure, input: { number: 123, boolean: true } })
    expect(next).toHaveBeenNthCalledWith(2, { procedure, input: { number: 456, boolean: false } })
  })

  it('passes maxStepsPerValue to the coercer', async () => {
    const procedure = oc.input(z.object({ page: z.number() }))
    const interceptor = new SmartCoercionHandlerPlugin({ maxStepsPerValue: 0 }).init({} as any).clientInterceptors?.[0]
    const next = vi.fn()

    await interceptor?.({ procedure, input: { page: '1' }, next } as any)

    expect(next).toHaveBeenCalledWith({ procedure, input: { page: '1' } })
  })

  it('passes maxBigIntDigits to the coercer', async () => {
    const plugin = new SmartCoercionHandlerPlugin({
      converters: [{
        condition: () => true,
        convert: () => [{ 'type': 'string', 'pattern': '^-?[0-9]+$', 'x-native-type': 'bigint' } as any, false],
      }],
      maxBigIntDigits: 3,
    })
    const procedure = oc.input(z.unknown())
    const interceptor = plugin.init({} as any).clientInterceptors?.[0]
    const next = vi.fn()

    await interceptor?.({ procedure, input: '999', next } as any)
    await interceptor?.({ procedure, input: '1000', next } as any)

    expect(next).toHaveBeenNthCalledWith(1, { procedure, input: 999n })
    expect(next).toHaveBeenNthCalledWith(2, { procedure, input: '1000' })
  })
})
