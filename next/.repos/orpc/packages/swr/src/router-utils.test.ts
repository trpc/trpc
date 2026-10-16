import { ProcedureUtils } from './procedure-utils'
import { createRouterUtils } from './router-utils'

vi.mock('./procedure-utils', async (importOriginal) => {
  const { SharedUtils } = await import('./shared-utils')

  return {
    ...await importOriginal<typeof import('./procedure-utils')>(),
    ProcedureUtils: vi.fn(class extends SharedUtils<unknown> {
      call = vi.fn()
      override matcher = SharedUtils.prototype.matcher
      key = vi.fn(() => ({ key: true }))
      fetcher = vi.fn(() => ({ fetcher: true }))

      constructor(path: string[], _client: unknown, options: any = {}) {
        super(path, options)
      }
    }),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createRouterUtils', () => {
  const client = vi.fn() as any
  client.key = vi.fn() // "key" mean client can handle when client and method is conflict
  client.key.pong = vi.fn()

  it('creates nested procedure & shared utils', () => {
    const utils = createRouterUtils(client, {
      prefix: '__prefix__',
    }) as any

    expect(ProcedureUtils).toHaveBeenCalledTimes(1)
    expect(ProcedureUtils).toHaveBeenCalledWith([], client, { prefix: '__prefix__' })
    expect(utils.matcher()(['__prefix__', [], {}])).toBe(true)
    expect(utils.matcher()([[], {}])).toBe(false)
    expect(utils.fetcher()).toBe(vi.mocked(ProcedureUtils).mock.results[0]?.value.fetcher.mock.results[0]?.value)

    vi.clearAllMocks()
    const keyUtils = utils.key

    expect(ProcedureUtils).toHaveBeenCalledTimes(1)
    expect(ProcedureUtils).toHaveBeenCalledWith(['key'], client.key, { prefix: '__prefix__' })
    expect(keyUtils.matcher()(['__prefix__', ['key'], {}])).toBe(true)
    expect(keyUtils.fetcher()).toBe(vi.mocked(ProcedureUtils).mock.results[0]?.value.fetcher.mock.results[0]?.value)

    vi.clearAllMocks()
    const pongUtils = keyUtils.pong

    expect(ProcedureUtils).toHaveBeenCalledTimes(1)
    expect(ProcedureUtils).toHaveBeenCalledWith(['key', 'pong'], client.key.pong, { prefix: '__prefix__' })
    expect(pongUtils.matcher()(['__prefix__', ['key', 'pong'], {}])).toBe(true)
    expect(pongUtils.fetcher()).toBe(vi.mocked(ProcedureUtils).mock.results[0]?.value.fetcher.mock.results[0]?.value)
  })

  it('returns strictly equal utils on repeated access', () => {
    const utils = createRouterUtils(client) as any

    expect(utils.key).toBe(utils.key)
    expect(utils.key.pong).toBe(utils.key.pong)
    expect(utils.key.pong).not.toBe(utils.key)

    expect(createRouterUtils(client)).not.toBe(utils)
  })

  it('works with plain object routers', () => {
    const router = { nested: { ping: vi.fn() } } as any
    const utils = createRouterUtils(router) as any

    expect(ProcedureUtils).toHaveBeenCalledTimes(0)
    expect(utils.fetcher).toBeUndefined()
    expect(utils.matcher()([[], {}])).toBe(true)

    const nestedUtils = utils.nested

    expect(ProcedureUtils).toHaveBeenCalledTimes(0)
    expect(nestedUtils.matcher()([['nested'], {}])).toBe(true)

    const pingUtils = nestedUtils.ping

    expect(ProcedureUtils).toHaveBeenCalledTimes(1)
    expect(ProcedureUtils).toHaveBeenCalledWith(['nested', 'ping'], router.nested.ping, { prefix: undefined })
    expect(pingUtils.fetcher()).toBe(vi.mocked(ProcedureUtils).mock.results[0]?.value.fetcher.mock.results[0]?.value)
  })

  it('stops recursive on symbol', () => {
    const utils = createRouterUtils(client) as any
    expect(utils[Symbol.for('a')]).toBe(undefined)
  })

  it('stops recursive on symbol and RECURSIVE_CLIENT_UNWRAP_KEYS of conflicting method proxies', () => {
    const utils = createRouterUtils(client) as any
    const keyUtils = utils.key // "key" is both a util method and a nested client

    expect(keyUtils[Symbol.for('a')]).toBe(undefined)
    expect(keyUtils.bind).toBeInstanceOf(Function) // resolved from the underlying method, not the nested utils
  })

  it('stops recursive on RECURSIVE_CLIENT_UNWRAP_KEYS', () => {
    client.then = vi.fn()

    try {
      const utils = createRouterUtils(client) as any

      expect(utils.then).toBe(undefined)
      expect(ProcedureUtils).toHaveBeenCalledTimes(1) // only the root utils
    }
    finally {
      delete client.then
    }
  })

  it('resolves call/apply from the utils instead of recursing', () => {
    const utils = createRouterUtils(client) as any
    const call = vi.mocked(ProcedureUtils).mock.results[0]?.value.call

    expect(utils.call).toBe(call)
    expect(utils.apply).toBeUndefined()
    expect(ProcedureUtils).toHaveBeenCalledTimes(1) // only the root utils

    // .call.call() invokes the same underlying function as .call()
    expect(utils.call.call).toBe(Function.prototype.call)
    utils.call('direct')
    utils.call.call(undefined, 'via-call')
    utils.call.apply(undefined, ['via-apply'])
    expect(call).toHaveBeenNthCalledWith(1, 'direct')
    expect(call).toHaveBeenNthCalledWith(2, 'via-call')
    expect(call).toHaveBeenNthCalledWith(3, 'via-apply')
  })
})
