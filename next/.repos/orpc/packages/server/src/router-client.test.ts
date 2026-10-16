import z from 'zod'
import { os } from './builder'
import * as ProcedureClientModule from './procedure-client'
import * as ProcedureUtilsModule from './procedure-utils'
import { createRouterClient } from './router-client'
import * as RouterUtilsModule from './router-utils'

const createProcedureClientSpy = vi.spyOn(ProcedureClientModule, 'createProcedureClient')
const createGuardedProcedureLazySpy = vi.spyOn(ProcedureUtilsModule, 'createGuardedProcedureLazy')
const getRouterSpy = vi.spyOn(RouterUtilsModule, 'getRouter')

const errorMap = {
  BASE: {
    data: z.string(),
  },
}

// Schemas should have distinct TInput and TOutput types to ensure correct inference.
const schema1 = z.object({ schema1: z.number().transform(n => `${n}`) })
const schema2 = z.object({ schema2: z.number().transform(n => `${n}`) })
const schema3 = z.object({ schema3: z.boolean().transform(n => `${n}`) })

const router = {
  ping: os.input(schema1).output(schema2).handler(() => ({ schema2: 1 })),
  nested: os.router({
    pong: os.input(schema3).output(schema2).errors(errorMap).handler(() => ({ schema2: 2 })),
  }),
  lazy: os.lazy(() => Promise.resolve({
    default: {
      peng: os.input(schema1).handler(() => 'output'),
    },
  })),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createRouterClient', () => {
  const options = { context: { auth: true } }
  const client = createRouterClient(router, options)

  it('procedure at root level', () => {
    const pingClient = client.ping
    expect(createProcedureClientSpy).toHaveBeenCalledTimes(1)
    expect(createProcedureClientSpy).toHaveBeenCalledWith(router.ping, { ...options, path: ['ping'] })

    expect(pingClient).toBe(createProcedureClientSpy.mock.results[0]!.value)
  })

  it('procedure inside nested router', () => {
    const pongClient = client.nested.pong
    expect(createProcedureClientSpy).toHaveBeenCalledTimes(1)
    expect(createProcedureClientSpy).toHaveBeenCalledWith(router.nested.pong, { ...options, path: ['nested', 'pong'] })

    expect(pongClient).toBe(createProcedureClientSpy.mock.results[0]!.value)
  })

  it('procedure inside lazy router', async () => {
    createProcedureClientSpy
      .mockReturnValueOnce((() => '__MOCK1__') as any)
      .mockReturnValueOnce((() => '__MOCK2__') as any)

    const pengClient = client.lazy.peng

    expect(getRouterSpy).toHaveBeenCalledTimes(2)
    expect(getRouterSpy).toHaveBeenNthCalledWith(2, router.lazy, ['peng'])

    expect(createGuardedProcedureLazySpy).toHaveBeenCalledTimes(2)
    expect(createGuardedProcedureLazySpy).toHaveBeenNthCalledWith(2, getRouterSpy.mock.results[1]!.value)

    expect(createProcedureClientSpy).toHaveBeenCalledTimes(2)
    expect(createProcedureClientSpy).toHaveBeenNthCalledWith(
      2,
      createGuardedProcedureLazySpy.mock.results[1]!.value,
      { ...options, path: ['lazy', 'peng'] },
    )

    expect((pengClient as any)()).toBe('__MOCK2__')
  })

  it('returns strictly equal client on repeated access', () => {
    const isolatedClient = createRouterClient(router, options)

    expect(isolatedClient.ping).toBe(isolatedClient.ping)
    expect(isolatedClient.nested).toBe(isolatedClient.nested)
    expect(isolatedClient.nested.pong).toBe(isolatedClient.nested.pong)
    expect(isolatedClient.lazy.peng).toBe(isolatedClient.lazy.peng)
    expect(isolatedClient.nested.pong).not.toBe(isolatedClient.ping)

    // ping, nested.pong, lazy, and lazy.peng — each created exactly once
    expect(createProcedureClientSpy).toHaveBeenCalledTimes(4)

    expect(createRouterClient(router, options).ping).not.toBe(isolatedClient.ping)
  })

  it('not define on Symbol, undefined procedure, inherited, or unwrap lazy properties', () => {
    expect((client as any).invalid).toBeUndefined()
    expect((client as any).toString).toBe(Object.prototype.toString)
    expect((client as any).nested.hasOwnProperty).toBe(Object.prototype.hasOwnProperty)
    expect((client as any)[Symbol.for('something')]).toBeUndefined()
    expect((client as any).lazy.then).toBeUndefined()
    expect((client as any).lazy.call).toBe(Function.prototype.call)
    expect((client as any).lazy.apply).toBe(Function.prototype.apply)
  })

  it('exposes procedures named like unwrap properties on non-lazy routers', () => {
    const toStringClient = createRouterClient({ toString: router.ping }, options).toString

    expect(toStringClient).toBe(createProcedureClientSpy.mock.results[0]!.value)
  })
})
