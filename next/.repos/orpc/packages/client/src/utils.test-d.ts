import type { ORPCError } from './error'
import type { Client, ClientContext } from './types'
import { isDefinedError } from './error-utils'
import { safe } from './utils'

describe('safe', async () => {
  const client = {} as Client<ClientContext, string, number, Error | ORPCError<'BAD_GATEWAY', { val: string }>>

  it('tuple style', async () => {
    const [error, data, definedError, isSuccess] = await safe(client('123'))

    if (error || !isSuccess) {
      expectTypeOf(error).toEqualTypeOf<Error | ORPCError<'BAD_GATEWAY', { val: string }>>()
      expectTypeOf(data).toEqualTypeOf<undefined>()
      expectTypeOf(definedError).toEqualTypeOf<null | ORPCError<'BAD_GATEWAY', { val: string }>>()

      if (isDefinedError(error)) {
        expectTypeOf(error).toEqualTypeOf<ORPCError<'BAD_GATEWAY', { val: string }>>()
      }

      if (definedError) {
        expectTypeOf(error).toEqualTypeOf<ORPCError<'BAD_GATEWAY', { val: string }>>()
        expectTypeOf(definedError).toEqualTypeOf<ORPCError<'BAD_GATEWAY', { val: string }>>()
      }
      else {
        // TODO: FIX IT - ORPCError should not showing here
        expectTypeOf(error).toEqualTypeOf<Error | ORPCError<'BAD_GATEWAY', { val: string }>>()
        expectTypeOf(definedError).toEqualTypeOf<null>()
      }
    }
    else {
      expectTypeOf(error).toEqualTypeOf<null>()
      expectTypeOf(data).toEqualTypeOf<number>()
      expectTypeOf(definedError).toEqualTypeOf<null>()
    }
  })

  it('object style', async () => {
    const { error, data, definedError, isSuccess } = await safe(client('123'))

    if (error || !isSuccess) {
      expectTypeOf(error).toEqualTypeOf<Error | ORPCError<'BAD_GATEWAY', { val: string }>>()
      expectTypeOf(data).toEqualTypeOf<undefined>()
      expectTypeOf(definedError).toEqualTypeOf<null | ORPCError<'BAD_GATEWAY', { val: string }>>()

      if (isDefinedError(error)) {
        expectTypeOf(error).toEqualTypeOf<ORPCError<'BAD_GATEWAY', { val: string }>>()
      }

      if (definedError) {
        expectTypeOf(error).toEqualTypeOf<ORPCError<'BAD_GATEWAY', { val: string }>>()
        expectTypeOf(definedError).toEqualTypeOf<ORPCError<'BAD_GATEWAY', { val: string }>>()
      }
      else {
        // TODO: FIX IT - ORPCError should not showing here
        expectTypeOf(error).toEqualTypeOf<Error | ORPCError<'BAD_GATEWAY', { val: string }>>()
        expectTypeOf(definedError).toEqualTypeOf<null>()
      }
    }
    else {
      expectTypeOf(error).toEqualTypeOf<null>()
      expectTypeOf(data).toEqualTypeOf<number>()
      expectTypeOf(definedError).toEqualTypeOf<null>()
    }
  })

  it('support regular Promise', async () => {
    const { error, data } = await safe({} as Promise<number>)

    expectTypeOf(error).toEqualTypeOf<Error | null>()
    expectTypeOf(data).toEqualTypeOf<number | undefined>()
  })
})
