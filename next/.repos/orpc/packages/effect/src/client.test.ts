import type { Client, ClientContext, ORPCError } from '@orpc/client'
import { sleep } from '@orpc/shared'
import { Effect, Exit, Schedule } from 'effect'
import { createEffectClient } from './client'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createEffectClient', () => {
  const pingFn = vi.fn()
  const pongFn = vi.fn()

  const client = {
    ping: pingFn,
    nested: {
      pong: pongFn,
    },
    invalid: 'invalid',
  } as unknown as {
    ping: Client<ClientContext, string, number, Error | ORPCError<'NOT_FOUND', string>>
    nested: {
      pong: Client<ClientContext, { id: number }, { result: string }, Error>
    }
  }

  const effectClient = createEffectClient(client)

  it('procedures return yieldable effects', async () => {
    pingFn.mockResolvedValue(42)
    pongFn.mockResolvedValue({ result: 'pong' })

    const program = Effect.gen(function* () {
      const ping = yield* effectClient.ping('input')
      const pong = yield* effectClient.nested.pong({ id: 123 })
      return [ping, pong]
    })

    await expect(Effect.runPromise(program)).resolves.toEqual([42, { result: 'pong' }])

    expect(pingFn).toHaveBeenCalledWith('input', {
      context: {},
      signal: expect.any(AbortSignal),
    })
    expect(pongFn).toHaveBeenCalledWith({ id: 123 }, {
      context: {},
      signal: expect.any(AbortSignal),
    })
  })

  it('forwards context, lastEventId, and merges the signal', async () => {
    pingFn.mockResolvedValue(42)
    const controller = new AbortController()

    await Effect.runPromise(effectClient.ping('input', {
      context: { cache: true },
      lastEventId: 'id-1',
      signal: controller.signal,
    }))

    const options = pingFn.mock.calls[0]![1]
    expect(options.context).toEqual({ cache: true })
    expect(options.lastEventId).toBe('id-1')
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.signal.aborted).toBe(false)

    controller.abort()
    expect(options.signal.aborted).toBe(true)
  })

  it('captures rejections in the error channel', async () => {
    const error = new Error('__TEST__')
    pingFn.mockRejectedValue(error)

    const exit = await Effect.runPromiseExit(effectClient.ping('input'))

    expect(exit).toEqual(Exit.fail(error))
  })

  it('procedures are lazy and re-invoke the client on retry', async () => {
    pingFn
      .mockRejectedValueOnce(new Error('__TEST__'))
      .mockRejectedValueOnce(new Error('__TEST__'))
      .mockResolvedValueOnce(42)

    const effect = effectClient.ping('input')
    await sleep(0)
    expect(pingFn).not.toHaveBeenCalled()

    await expect(
      Effect.runPromise(effect.pipe(Effect.retry(Schedule.recurs(2)))),
    ).resolves.toBe(42)

    expect(pingFn).toHaveBeenCalledTimes(3)
  })

  it('aborts the call when the effect is interrupted', async () => {
    let clientSignal: AbortSignal | undefined
    pingFn.mockImplementation((_input, options) => {
      clientSignal = options.signal
      return new Promise(() => {})
    })

    const signal = AbortSignal.timeout(10)
    const exit = await Effect.runPromiseExit(effectClient.ping('input'), { signal })

    expect(Exit.hasInterrupts(exit)).toBe(true)
    expect(clientSignal!.aborted).toBe(true)
  })

  it('returns strictly equal client on repeated access', () => {
    expect(effectClient.ping).toBe(effectClient.ping)
    expect(effectClient.nested).toBe(effectClient.nested)
    expect(effectClient.nested.pong).toBe(effectClient.nested.pong)
    expect(effectClient.nested.pong).not.toBe(effectClient.ping as unknown)

    expect(createEffectClient(client)).not.toBe(effectClient)
  })

  it('not proxy on non-object or symbol properties', () => {
    expect((effectClient as any).invalid).toBe('invalid')
    expect((effectClient as any)[Symbol('test')]).toEqual(undefined)
    expect((effectClient.nested as any)[Symbol('test')]).toEqual(undefined)
  })

  it('not recursive on unwrap keys', async () => {
    const anyClient = effectClient as any

    expect(anyClient.then).toBeUndefined()
    expect(await anyClient).toBe(effectClient)
    expect(anyClient.bind).toBe(anyClient.bind)
    expect(anyClient.valueOf).toBe(anyClient.valueOf)
    expect(anyClient.toString).toBe(anyClient.toString)
    expect(anyClient.toJSON).toBeUndefined()
    expect(anyClient.call).toBe(Function.prototype.call)
    expect(anyClient.apply).toBe(Function.prototype.apply)

    expect(anyClient.nested.then).toBeUndefined()
    expect(await anyClient.nested).toBe(anyClient.nested)
  })
})
