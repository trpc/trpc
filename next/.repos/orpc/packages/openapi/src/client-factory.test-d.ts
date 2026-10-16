import type { ClientLink, ORPCError } from '@orpc/client'
import type { PromiseWithError } from '@orpc/shared'
import { oc, type } from '@orpc/contract'
import { createContractJsonifiedClientFactory } from './client-factory'

const contract = {
  ping: oc,
  nested: {
    pong: oc
      .errors({ BAD_GATEWAY: { data: type<string, URL>(vi.fn()) } })
      .input(type<string, boolean>(vi.fn()))
      .output(type<number, Date>(vi.fn())),
  },
}

describe('createContractJsonifiedClientFactory', () => {
  const link = {} as ClientLink<{ cache?: boolean }>

  it('infers interceptor input, output, errors types', () => {
    createContractJsonifiedClientFactory(link, {
      contractRef: contract,
      interceptors: [
        async ({ context, next, input }) => {
          expectTypeOf(input).toEqualTypeOf<unknown>()
          expectTypeOf(context).toEqualTypeOf<{ cache?: boolean }>()

          const result = next()

          expectTypeOf(result).toEqualTypeOf<
            PromiseWithError<unknown, unknown>
          >()

          return result
        },
      ],
      scoped: {
        ping: {
          interceptors: [
            async ({ context, next, input }) => {
              expectTypeOf(input).toEqualTypeOf<unknown>()
              expectTypeOf(context).toEqualTypeOf<{ cache?: boolean }>()

              const result = next()

              expectTypeOf(result).toEqualTypeOf<
                PromiseWithError<unknown, Error | ORPCError<string, unknown>>
              >()

              return result
            },
          ],
        },
        nested: {
          pong: {
            interceptors: [
              async ({ context, next, input }) => {
                expectTypeOf(input).toEqualTypeOf<unknown>()
                expectTypeOf(context).toEqualTypeOf<{ cache?: boolean }>()

                const result = next()

                expectTypeOf(result).toEqualTypeOf<
                  PromiseWithError<unknown, Error | ORPCError<string, unknown>>
                >()

                return result
              },
            ],
          },
        },
      },
    })
  })

  it('returns a client & infers procedure return types', () => {
    const factory = createContractJsonifiedClientFactory(link)

    expectTypeOf(
      factory(contract.ping)(),
    ).toEqualTypeOf<
      PromiseWithError<unknown, Error>
    >()

    expectTypeOf(
      factory(contract.nested.pong)('string', { context: { cache: true } }),
    ).toEqualTypeOf<
      PromiseWithError<string, Error | ORPCError<'BAD_GATEWAY', string>>
    >()
  })

  it('returns a router client when a router contract is passed', () => {
    const factory = createContractJsonifiedClientFactory(link)

    const client = factory(contract)

    expectTypeOf(
      client.ping(),
    ).toEqualTypeOf<
      PromiseWithError<unknown, Error>
    >()

    expectTypeOf(
      client.nested.pong('string', { context: { cache: true } }),
    ).toEqualTypeOf<
      PromiseWithError<string, Error | ORPCError<'BAD_GATEWAY', string>>
    >()
  })

  it('rejects invalid input', () => {
    const factory = createContractJsonifiedClientFactory(link)

    // @ts-expect-error - invalid input
    factory(contract.nested.pong)(123)
  })

  it('rejects invalid context', () => {
    const factory = createContractJsonifiedClientFactory(link)

    // @ts-expect-error - invalid context
    factory(contract.nested.pong)('string', { context: { cache: 'invalid' } })
  })
})
