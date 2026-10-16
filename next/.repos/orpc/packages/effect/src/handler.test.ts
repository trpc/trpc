import type { WithEffectContext } from './context'
import { call, ORPCError, os, type } from '@orpc/server'
import { Context, Effect } from 'effect'
import { handlerGen } from './handler'
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

class Service2 extends Context.Service<
  Service2,
  {
    readonly id: 'Service2'
  }
>()('Service2') {}

describe('handlerGen', () => {
  it('works with native Effect syntax, and throws failed ORPCError as-is', async () => {
    await expect(
      call(os.handler(handlerGen(function* () {
        return 'output'
      }))),
    ).resolves.toEqual('output')

    const error = new ORPCError('__TEST__')

    await expect(
      call(os.handler(handlerGen(function* () {
        yield* Effect.fail(error)
      }))),
    ).rejects.toBe(error)
    expect(error.defined).toBe(false)
  })

  it('throw original errors without fiber failure error wrapper', async () => {
    const error = new Error('__TEST__')
    await expect(
      call(os.handler(handlerGen(function* () {
        yield* Effect.fail(error)
      }))),
    ).rejects.toBe(error)

    expect(runPromiseSpy).toHaveBeenCalledTimes(1)
  })

  it('forwards the provided signal to runPromise', async () => {
    const controller = new AbortController()

    await expect(
      call(
        os.handler(handlerGen(function* () {
          return 'output'
        })),
        undefined,
        { signal: controller.signal },
      ),
    ).resolves.toEqual('output')

    expect(runPromiseSpy).toHaveBeenCalledTimes(1)
    expect(runPromiseSpy).toHaveBeenNthCalledWith(1, expect.anything(), { signal: controller.signal })
  })

  it('can access context, input, errors, signal, ...', async () => {
    const procedure = os.input(type<any>()).handler(handlerGen(function* ({ context, signal, lastEventId, path }, input) {
      expect(input).toEqual('input')
      expect(context).toEqual({ context: true })
      expect(signal).toBeInstanceOf(AbortSignal)
      expect(lastEventId).toEqual('id')
      expect(path).toEqual(['path'])

      return 'success'
    }))

    await expect(
      call(
        procedure,
        'input',
        { context: { context: true }, signal: AbortSignal.timeout(0), lastEventId: 'id', path: ['path'] },
      ),
    ).resolves.toEqual('success')
  })

  it('can deal with effect context', async () => {
    await expect(call(
      os
        .$context<WithEffectContext<Service1>>()
        .handler(handlerGen(function* () {
          const service1 = yield* Service1
          return `output:${service1.id}`
        })),
      undefined,
      { context: { 'effect/context': Context.empty().pipe(Context.add(Service1, { id: 'Service1' })) } },
    )).resolves.toEqual('output:Service1')

    await expect(call(
      os
        .$context<any>()
        .handler(handlerGen(function* () {
          const service1 = yield* Service1
          const service2 = yield* Service2
          return `output:${service1.id}`
        })),
      undefined,
      { context: { 'effect/context': Context.empty().pipe(Context.add(Service1, { id: 'Service1' })) } },
    )).rejects.toThrow('Service2')
  })

  it('can wrap effect execution and receives procedure options', async () => {
    let wrappedCalls = 0
    let wrappedPath: string[] | undefined
    let wrappedProcedure: unknown
    let wrappedSignal: unknown

    const procedure = os
      .$context<WithEffectContext<never>>()
      .handler(handlerGen(function* () {
        return 'output'
      }))

    const signal = AbortSignal.timeout(100)

    await expect(call(
      procedure,
      undefined,
      {
        path: ['wrapped', 'procedure'],
        context: {
          'effect/context': Context.empty(),
          'effect/wrap': (effect, opts) => effect.pipe(Effect.tap(() => Effect.sync(() => {
            wrappedCalls += 1
            wrappedPath = opts.path
            wrappedProcedure = opts.procedure
            wrappedSignal = opts.signal
          }))),
        },
        signal,
      },
    )).resolves.toEqual('output')

    expect(wrappedCalls).toBe(1)
    expect(wrappedPath).toEqual(['wrapped', 'procedure'])
    expect(wrappedProcedure).toBe(procedure)
    expect(wrappedSignal).toBe(signal)
  })

  it('throws ORPCError failures from wrap as-is', async () => {
    const error = new ORPCError('__TEST__')

    const procedure = os
      .$context<WithEffectContext<never>>()
      .handler(handlerGen(function* () {
        return 'output'
      }))

    await expect(call(
      procedure,
      undefined,
      {
        context: {
          'effect/context': Context.empty(),
          'effect/wrap': () => Effect.fail(error) as any,
        },
      },
    )).rejects.toBe(error)
    expect(error.defined).toBe(false)
  })
})
