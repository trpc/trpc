import type { Client, ClientContext, ORPCError } from '@orpc/client'
import type { EffectClient } from './client'
import { isDefinedError } from '@orpc/client'
import { Effect } from 'effect'
import { createEffectClient } from './client'
import { catchORPCErrorCodes } from './error'

describe('createEffectClient', () => {
  const client = {} as {
    ping: Client<ClientContext, string, number, Error | ORPCError<'BAD_GATEWAY', { val: string }> | ORPCError<'NOT_FOUND', { id: number }>>
    optional: Client<ClientContext, string | undefined, number, Error>
    nested: {
      pong: Client<{ cache: boolean }, { id: number }, { result: string }, Error>
    }
  }

  const effectClient = createEffectClient(client)

  it('procedures return effects with output and error types preserved', () => {
    expectTypeOf(effectClient.ping('test')).toEqualTypeOf<
      Effect.Effect<number, Error | ORPCError<'BAD_GATEWAY', { val: string }> | ORPCError<'NOT_FOUND', { id: number }>>
    >()

    expectTypeOf(effectClient.nested.pong({ id: 123 }, { context: { cache: true } })).toEqualTypeOf<
      Effect.Effect<{ result: string }, Error>
    >()
  })

  it('enforces input and options types', () => {
    // @ts-expect-error - input must be a string
    void effectClient.ping(123)
    // @ts-expect-error - invalid context
    void effectClient.nested.pong({ id: 123 }, { context: { cache: 'invalid' } })
    // @ts-expect-error - context is required
    void effectClient.nested.pong({ id: 123 })
  })

  it('allows omitting optional input', () => {
    void effectClient.optional()
    void effectClient.optional('input')
  })

  it('EffectClient type maps nested clients', () => {
    expectTypeOf(effectClient).toEqualTypeOf<EffectClient<typeof client>>()
  })

  it('data is unknown when catching by code, because the error may be a hidden ORPCError', () => {
    const recovered = effectClient.ping('test').pipe(
      catchORPCErrorCodes({
        BAD_GATEWAY: (error) => {
          expectTypeOf(error.code).toEqualTypeOf<'BAD_GATEWAY'>()
          expectTypeOf(error.data).toEqualTypeOf<unknown>()

          return Effect.succeed('recovered' as const)
        },
      }),
    )

    expectTypeOf(recovered).toEqualTypeOf<
      Effect.Effect<number | 'recovered', Error | ORPCError<'NOT_FOUND', { id: number }>>
    >()
  })

  it('combines isDefinedError with code narrowing for typesafe error data', () => {
    const recovered = effectClient.ping('test').pipe(
      Effect.catchIf(isDefinedError, (error) => {
        expectTypeOf(error).toEqualTypeOf<
          ORPCError<'BAD_GATEWAY', { val: string }> | ORPCError<'NOT_FOUND', { id: number }>
        >()

        if (error.code === 'BAD_GATEWAY') {
          expectTypeOf(error.data).toEqualTypeOf<{ val: string }>()
        }

        return Effect.succeed('recovered' as const)
      }),
    )

    expectTypeOf(recovered).toEqualTypeOf<Effect.Effect<number | 'recovered', Error>>()
  })
})
