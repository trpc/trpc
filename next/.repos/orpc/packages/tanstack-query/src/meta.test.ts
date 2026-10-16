import { oc } from '@orpc/contract'
import { ContractOptionsUtilsPlugin, getTanstackQueryMeta, tanstackQuery } from './meta'
import { createRouterUtils } from './router-utils'

describe('tanstackQuery', () => {
  it('stores options readable via getTanstackQueryMeta', () => {
    const interceptor = vi.fn()
    const contract = oc.meta(tanstackQuery({
      queryOptions: { staleTime: 1000 },
      queryInterceptors: [interceptor],
    }))

    expect(getTanstackQueryMeta(contract)).toEqual({
      queryOptions: { staleTime: 1000 },
      queryInterceptors: [interceptor],
    })

    expect(getTanstackQueryMeta(oc)).toBeUndefined()
  })

  it('merges options when applied multiple times', () => {
    const interceptor1 = vi.fn()
    const interceptor2 = vi.fn()
    const keyModifier = vi.fn()

    const contract = oc
      .meta(tanstackQuery({
        queryKey: keyModifier,
        queryOptions: { staleTime: 1000, retry: 1 },
        queryInterceptors: [interceptor1],
      }))
      .meta(tanstackQuery({
        queryOptions: { retry: 2 },
        mutationInterceptors: [interceptor2],
      }))

    expect(getTanstackQueryMeta(contract)).toEqual({
      queryKey: keyModifier,
      queryOptions: { staleTime: 1000, retry: 2 },
      queryInterceptors: [interceptor1],
      mutationInterceptors: [interceptor2],
    })
  })

  it('propagates base meta to procedures via .router', () => {
    const router = oc
      .meta(tanstackQuery({ queryOptions: { staleTime: 1000 } }))
      .router({
        ping: oc.meta(tanstackQuery({ queryOptions: { retry: 2 } })),
        pong: oc,
      })

    expect(getTanstackQueryMeta(router.ping)).toEqual({
      queryOptions: { staleTime: 1000, retry: 2 },
    })

    expect(getTanstackQueryMeta(router.pong)).toEqual({
      queryOptions: { staleTime: 1000 },
    })
  })
})

describe('contractMetaPlugin', () => {
  it('leaves options unchanged when no procedure or no meta at path', () => {
    const plugin = new ContractOptionsUtilsPlugin({ planet: { find: oc } })
    const options = { prefix: '__prefix__' }

    expect(plugin.initProcedureOptions(['unknown'], options)).toBe(options)
    expect(plugin.initProcedureOptions(['planet'], options)).toBe(options)
    expect(plugin.initProcedureOptions(['planet', 'find'], options)).toBe(options)
  })

  it('merges meta options as base under current options', () => {
    const metaInterceptor = vi.fn()
    const existingInterceptor = vi.fn()

    const plugin = new ContractOptionsUtilsPlugin({
      planet: {
        find: oc.meta(tanstackQuery({
          queryOptions: { staleTime: 1000, retry: 1 },
          queryInterceptors: [metaInterceptor],
        })),
      },
    })

    const result = plugin.initProcedureOptions(['planet', 'find'], {
      prefix: '__prefix__',
      queryOptions: { retry: 2 },
      queryInterceptors: [existingInterceptor],
    } as any)

    expect(result).toEqual({
      prefix: '__prefix__',
      queryOptions: { staleTime: 1000, retry: 2 },
      queryInterceptors: [metaInterceptor, existingInterceptor],
    })
  })

  it('applies contract meta through createRouterUtils', async () => {
    const marks: string[] = []
    const metaInterceptor = vi.fn(({ next }: any) => {
      marks.push('meta')
      return next()
    })
    const utilsInterceptor = vi.fn(({ next }: any) => {
      marks.push('utils')
      return next()
    })

    const contract = {
      planet: {
        find: oc.meta(tanstackQuery({
          queryOptions: { staleTime: 1000, retry: 1 },
          queryInterceptors: [metaInterceptor],
        })),
      },
    }

    const client = {
      planet: {
        find: vi.fn(async () => '__found__'),
      },
    }

    const utils = createRouterUtils(client as any, {
      queryInterceptors: [utilsInterceptor],
      scoped: {
        planet: {
          find: {
            queryOptions: { retry: 2 },
          },
        },
      },
      plugins: [new ContractOptionsUtilsPlugin(contract)],
    }) as any

    const options = utils.planet.find.queryOptions({ input: { id: 1 } })

    expect(options.staleTime).toBe(1000)
    expect(options.retry).toBe(2)

    await expect(options.queryFn({ signal: undefined })).resolves.toBe('__found__')

    expect(marks).toEqual(['meta', 'utils'])
    expect(client.planet.find).toHaveBeenCalledTimes(1)
  })

  it('lets object utils options beat defaults of a function meta modifier', () => {
    const contract = {
      planet: {
        find: oc.meta(tanstackQuery({
          queryOptions: (options: any) => ({ staleTime: 1000, retry: 1, ...options }),
        })),
      },
    }

    const client = { planet: { find: vi.fn(async () => '__found__') } }

    const utils = createRouterUtils(client as any, {
      scoped: {
        planet: {
          find: {
            queryOptions: { retry: 2 },
          },
        },
      },
      plugins: [new ContractOptionsUtilsPlugin(contract)],
    }) as any

    const options = utils.planet.find.queryOptions({ input: { id: 1 } })

    expect(options.staleTime).toBe(1000)
    expect(options.retry).toBe(2)

    expect(utils.planet.find.queryOptions({ input: { id: 1 }, retry: 5 }).retry).toBe(5)
  })

  it('keeps contract meta interceptors when utils define none', async () => {
    const metaInterceptor = vi.fn(({ next }: any) => next())
    const contract = { planet: { find: oc.meta(tanstackQuery({ queryInterceptors: [metaInterceptor] })) } }
    const client = { planet: { find: vi.fn(async () => '__found__') } }

    const utils = createRouterUtils(client as any, {
      plugins: [new ContractOptionsUtilsPlugin(contract)],
    }) as any

    await expect(utils.planet.find.queryOptions({ input: { id: 1 } }).queryFn({ signal: undefined })).resolves.toBe('__found__')
    expect(metaInterceptor).toHaveBeenCalledTimes(1)
  })

  it('resets contract meta interceptors when utils set them to undefined explicitly', async () => {
    const metaInterceptor = vi.fn(({ next }: any) => next())
    const contract = { planet: { find: oc.meta(tanstackQuery({ queryInterceptors: [metaInterceptor] })) } }
    const client = { planet: { find: vi.fn(async () => '__found__') } }

    const utils = createRouterUtils(client as any, {
      queryInterceptors: undefined,
      plugins: [new ContractOptionsUtilsPlugin(contract)],
    }) as any

    await expect(utils.planet.find.queryOptions({ input: { id: 1 } }).queryFn({ signal: undefined })).resolves.toBe('__found__')
    expect(metaInterceptor).not.toHaveBeenCalled()
  })
})
