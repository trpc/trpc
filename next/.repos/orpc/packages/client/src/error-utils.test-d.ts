import type { ORPCError } from './error'
import { isDefinedError } from './error-utils'

describe('isDefinedError', () => {
  it('normal', () => {
    const error = { } as ORPCError<'BAD_REQUEST', { id: number }> | ORPCError<'CONFLICT', unknown> | Error

    if (isDefinedError(error)) {
      expectTypeOf<typeof error>().toEqualTypeOf<ORPCError<'BAD_REQUEST', { id: number }> | ORPCError<'CONFLICT', unknown>>()

      if (error.code === 'BAD_REQUEST') {
        expectTypeOf<typeof error.data.id>().toEqualTypeOf<number>()
      }
    }
    else {
      expectTypeOf<typeof error>().toEqualTypeOf<Error>()
    }
  })

  it('with any types', () => {
    const error: any = {}

    if (isDefinedError(error)) {
      expectTypeOf<typeof error>().toEqualTypeOf<any>()
    }
    else {
      // @ts-expect-error FIX: should be any
      expectTypeOf<typeof error>().toEqualTypeOf<any>()
    }
  })

  it('with unknown type', () => {
    const error: unknown = {}

    if (isDefinedError(error)) {
      // @ts-expect-error FIX: should be unknown or any
      expectTypeOf<typeof error>().toEqualTypeOf<unknown>()
    }
    else {
      expectTypeOf<typeof error>().toEqualTypeOf<unknown>()
    }
  })
})
