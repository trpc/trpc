import type { ClientContext, ORPCError } from '@orpc/client'
import type { PromiseWithError } from '@orpc/shared'
import type { OperationContext } from './types'
import { oc, type } from '@orpc/contract'
import { piniaColada } from './meta'

describe('piniaColada', () => {
  it('infers input, output and error types from the contract', () => {
    oc
      .errors({ BAD_GATEWAY: { data: type<string, RegExp>(vi.fn()) } })
      .input(type<string, boolean>(vi.fn()))
      .output(type<number, Date>(vi.fn()))
      .meta(piniaColada({
        queryOptions: { staleTime: 1000 },
        queryInterceptors: [
          async ({ context, input, next }) => {
            expectTypeOf(input).toEqualTypeOf<string>()
            expectTypeOf(context).toEqualTypeOf<ClientContext & OperationContext>()

            const result = next()

            expectTypeOf(result).toEqualTypeOf<
              PromiseWithError<Date, Error | ORPCError<'BAD_GATEWAY', RegExp>>
            >()

            return result
          },
        ],
        mutationOptions: {
          onSuccess: (data, input) => {
            expectTypeOf(data).toEqualTypeOf<Date>()
            expectTypeOf(input).toEqualTypeOf<string>()
          },
        },
      }))
  })

  it('rejects invalid base options', () => {
    oc.output(type<number, Date>(vi.fn())).meta(piniaColada({
      queryOptions: {
        // @ts-expect-error - staleTime must be a number
        staleTime: 'invalid',
      },
    }))
  })
})
