import type { WithEffectContext } from './context'
import { call, ORPCError, os } from '@orpc/server'
import { Context, Effect } from 'effect'
import { middlewareGen } from './middleware'
import * as EffectModule from './runtime'

const runPromiseSpy = vi.spyOn(EffectModule, 'runPromise')

beforeEach(() => {
  vi.clearAllMocks()
})

class Service1 extends Context.Service<
  Service1,
  {
    readonly id: 'Service1'
  }
>()('Service1') {}

describe('middlewareGen', () => {
  it('continues the chain and can extend the context', async () => {
    const procedure = os
      .$context<{ auth: boolean }>()
      .use(middlewareGen(function* ({ next }) {
        const random = yield* Effect.sync(() => 42)
        return yield* next({ context: { random } })
      }))
      .handler(({ context }) => `output:${context.random}`)

    await expect(
      call(procedure, undefined, { context: { auth: true } }),
    ).resolves.toEqual('output:42')
  })

  it('can terminate the chain early with done', async () => {
    const handlerFn = vi.fn(() => 'handler')

    const procedure = os
      .use(middlewareGen(function* (_, __, done) {
        return done({ output: 'early' })
      }))
      .handler(handlerFn)

    await expect(call(procedure)).resolves.toEqual('early')
    expect(handlerFn).not.toHaveBeenCalled()
  })

  it('can observe and recover downstream errors via the error channel', async () => {
    const error = new Error('__DOWNSTREAM__')

    const procedure = os
      .use(middlewareGen(function* ({ next }, _, done) {
        return yield* next().pipe(
          Effect.catch(() => Effect.sync(() => done({ output: 'recovered' }))),
        )
      }))
      .handler(() => {
        throw error
      })

    await expect(call(procedure)).resolves.toEqual('recovered')
  })

  it('preserves uncaught downstream errors as-is', async () => {
    const error = new Error('__DOWNSTREAM__')

    const procedure = os
      .use(middlewareGen(function* ({ next }) {
        return yield* next()
      }))
      .handler(() => {
        throw error
      })

    await expect(call(procedure)).rejects.toBe(error)
  })

  it('preserves middleware failures without fiber failure error wrapper', async () => {
    const error = new Error('__MIDDLEWARE__')

    const procedure = os
      .use(middlewareGen(function* ({ next }) {
        yield* Effect.fail(error)
        return yield* next()
      }))
      .handler(() => 'unreachable')

    await expect(call(procedure)).rejects.toBe(error)
  })

  it('propagates ORPCError thrown by the generator', async () => {
    const middleware = os
      .errors({ UNAUTHORIZED: {} })
      .middleware(middlewareGen(function* ({ errors }) {
        throw errors.UNAUTHORIZED()
      }))

    const procedure = os
      .use(middleware)
      .handler(() => 'unreachable')

    await expect(call(procedure)).rejects.toSatisfy(
      error => error instanceof ORPCError && error.code === 'UNAUTHORIZED' && error.defined,
    )
  })

  it('can access effect services from effect/context', async () => {
    const procedure = os
      .$context<WithEffectContext<Service1>>()
      .use(middlewareGen(function* ({ next }) {
        const service1 = yield* Service1
        return yield* next({ context: { fromService: service1.id } })
      }))
      .handler(({ context }) => `output:${context.fromService}`)

    await expect(call(
      procedure,
      undefined,
      { context: { 'effect/context': Context.empty().pipe(Context.add(Service1, { id: 'Service1' })) } },
    )).resolves.toEqual('output:Service1')
  })

  it('can wrap effect execution via effect/wrap', async () => {
    let wrappedCalls = 0

    const procedure = os
      .$context<WithEffectContext<never>>()
      .use(middlewareGen(function* ({ next }) {
        return yield* next()
      }))
      .handler(() => 'output')

    await expect(call(
      procedure,
      undefined,
      {
        context: {
          'effect/context': Context.empty(),
          'effect/wrap': effect => effect.pipe(Effect.tap(() => Effect.sync(() => {
            wrappedCalls += 1
          }))),
        },
      },
    )).resolves.toEqual('output')

    expect(wrappedCalls).toBe(1)
  })

  it('forwards the provided signal to runPromise', async () => {
    const controller = new AbortController()

    const procedure = os
      .use(middlewareGen(function* ({ next }) {
        return yield* next()
      }))
      .handler(() => 'output')

    await expect(
      call(procedure, undefined, { signal: controller.signal }),
    ).resolves.toEqual('output')

    expect(runPromiseSpy).toHaveBeenCalledTimes(1)
    expect(runPromiseSpy).toHaveBeenNthCalledWith(1, expect.anything(), { signal: controller.signal })
  })
})
