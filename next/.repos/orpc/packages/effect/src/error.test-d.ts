import type { ORPCError, ORPCErrorCode } from '@orpc/server'
import { Effect } from 'effect'
import { catchORPCError, catchORPCErrorCode, catchORPCErrorCodes } from './error'

class Service1 {
  declare id: 'Service1'
}

class Service2 {
  declare id: 'Service2'
}

const effect = {} as Effect.Effect<
  'output',
  ORPCError<'NOT_FOUND', { id: string }> | ORPCError<'CONFLICT', number>,
  Service1
>

const effectWithHidden = {} as Effect.Effect<
  'output',
  ORPCError<'NOT_FOUND', { id: string }> | Error,
  Service1
>

describe('catchORPCError', () => {
  it('catches every ORPCError and excludes them from the error channel (data-last)', () => {
    const recovered = effect.pipe(catchORPCError((error) => {
      expectTypeOf(error).toEqualTypeOf<ORPCError<'NOT_FOUND', { id: string }> | ORPCError<'CONFLICT', number>>()
      return Effect.succeed('recovered' as const)
    }))

    expectTypeOf(recovered).toEqualTypeOf<Effect.Effect<'output' | 'recovered', never, Service1>>()
  })

  it('catches every ORPCError and excludes them from the error channel (data-first)', () => {
    const recovered = catchORPCError(effect, (error) => {
      expectTypeOf(error).toEqualTypeOf<ORPCError<'NOT_FOUND', { id: string }> | ORPCError<'CONFLICT', number>>()
      return Effect.succeed('recovered' as const)
    })

    expectTypeOf(recovered).toEqualTypeOf<Effect.Effect<'output' | 'recovered', never, Service1>>()
  })

  it('merges handler error and requirement channels into the result', () => {
    const recovered = effect.pipe(
      catchORPCError(() => ({} as Effect.Effect<'recovered', RangeError, Service2>)),
    )

    expectTypeOf(recovered).toEqualTypeOf<Effect.Effect<'output' | 'recovered', RangeError, Service1 | Service2>>()
  })

  it('also receives hidden ORPCErrors, with unknown code and data', () => {
    const recovered = effectWithHidden.pipe(catchORPCError((error) => {
      expectTypeOf(error).toEqualTypeOf<ORPCError<'NOT_FOUND', { id: string }> | ORPCError<ORPCErrorCode, unknown>>()
      expectTypeOf(error.data).toEqualTypeOf<unknown>()
      return Effect.succeed('recovered' as const)
    }))

    expectTypeOf(recovered).toEqualTypeOf<Effect.Effect<'output' | 'recovered', Error, Service1>>()
  })

  it('treats failure types that can hold an ORPCError as possibly hiding one', () => {
    const withTypeError = {} as Effect.Effect<'output', ORPCError<'NOT_FOUND', { id: string }> | TypeError>

    void withTypeError.pipe(catchORPCError((error) => {
      expectTypeOf(error).toEqualTypeOf<ORPCError<'NOT_FOUND', { id: string }> | ORPCError<ORPCErrorCode, unknown>>()
      expectTypeOf(error.data).toEqualTypeOf<unknown>()
      return Effect.succeed('recovered' as const)
    }))
  })

  it('does not treat failure types that cannot hold an ORPCError as hidden', () => {
    const withString = {} as Effect.Effect<'output', ORPCError<'NOT_FOUND', { id: string }> | 'boom'>

    void withString.pipe(catchORPCError((error) => {
      expectTypeOf(error).toEqualTypeOf<ORPCError<'NOT_FOUND', { id: string }>>()
      expectTypeOf(error.data).toEqualTypeOf<{ id: string }>()
      return Effect.succeed('recovered' as const)
    }))

    const onlyString = {} as Effect.Effect<'output', 'boom'>

    void onlyString.pipe(catchORPCError((error) => {
      expectTypeOf(error).toEqualTypeOf<never>()
      return Effect.succeed('recovered' as const)
    }))
  })
})

describe('catchORPCErrorCode', () => {
  it('catches ORPCErrors with a matching code and excludes them from the error channel (data-last)', () => {
    const recovered = effect.pipe(catchORPCErrorCode('NOT_FOUND', (error) => {
      expectTypeOf(error).toEqualTypeOf<ORPCError<'NOT_FOUND', { id: string }>>()
      return Effect.succeed('recovered' as const)
    }))

    expectTypeOf(recovered).toEqualTypeOf<Effect.Effect<'output' | 'recovered', ORPCError<'CONFLICT', number>, Service1>>()
  })

  it('catches ORPCErrors with a matching code and excludes them from the error channel (data-first)', () => {
    const recovered = catchORPCErrorCode(effect, 'CONFLICT', (error) => {
      expectTypeOf(error).toEqualTypeOf<ORPCError<'CONFLICT', number>>()
      return Effect.succeed('recovered' as const)
    })

    expectTypeOf(recovered).toEqualTypeOf<Effect.Effect<'output' | 'recovered', ORPCError<'NOT_FOUND', { id: string }>, Service1>>()
  })

  it('merges handler error and requirement channels into the result', () => {
    const recovered = effect.pipe(
      catchORPCErrorCode('NOT_FOUND', () => ({} as Effect.Effect<'recovered', RangeError, Service2>)),
    )

    expectTypeOf(recovered).toEqualTypeOf<
      Effect.Effect<'output' | 'recovered', ORPCError<'CONFLICT', number> | RangeError, Service1 | Service2>
    >()
  })

  it('supports custom error codes', () => {
    const custom = {} as Effect.Effect<'output', ORPCError<'__CUSTOM__', undefined>>

    const recovered = custom.pipe(catchORPCErrorCode('__CUSTOM__', (error) => {
      expectTypeOf(error).toEqualTypeOf<ORPCError<'__CUSTOM__', undefined>>()
      return Effect.succeed('recovered' as const)
    }))

    expectTypeOf(recovered).toEqualTypeOf<Effect.Effect<'output' | 'recovered', never, never>>()
  })

  it('suggests and restricts the code to those present in the error channel', () => {
    // @ts-expect-error - BAD_GATEWAY is not present in the error channel (data-last)
    void effect.pipe(catchORPCErrorCode('BAD_GATEWAY', () => Effect.succeed('recovered')))

    // @ts-expect-error - BAD_GATEWAY is not present in the error channel (data-first)
    void catchORPCErrorCode(effect, 'BAD_GATEWAY', () => Effect.succeed('recovered'))

    // @ts-expect-error - code must be a string
    void effect.pipe(catchORPCErrorCode(123, () => Effect.succeed('recovered')))
  })

  it('widens data to unknown on declared codes when the channel can hold hidden ORPCErrors', () => {
    const recovered = effectWithHidden.pipe(catchORPCErrorCode('NOT_FOUND', (error) => {
      expectTypeOf(error).toEqualTypeOf<ORPCError<'NOT_FOUND', { id: string }> | ORPCError<'NOT_FOUND', unknown>>()
      expectTypeOf(error.data).toEqualTypeOf<unknown>()
      return Effect.succeed('recovered' as const)
    }))

    expectTypeOf(recovered).toEqualTypeOf<Effect.Effect<'output' | 'recovered', Error, Service1>>()
  })

  it('accepts undeclared codes when the channel can hold hidden ORPCErrors', () => {
    const recovered = effectWithHidden.pipe(catchORPCErrorCode('CONFLICT', (error) => {
      expectTypeOf(error).toEqualTypeOf<ORPCError<'CONFLICT', unknown>>()
      return Effect.succeed('recovered' as const)
    }))

    expectTypeOf(recovered).toEqualTypeOf<
      Effect.Effect<'output' | 'recovered', ORPCError<'NOT_FOUND', { id: string }> | Error, Service1>
    >()
  })

  it('unknown error channels can also hold hidden ORPCErrors', () => {
    const withUnknown = {} as Effect.Effect<'output', unknown>

    void withUnknown.pipe(catchORPCErrorCode('CONFLICT', (error) => {
      expectTypeOf(error).toEqualTypeOf<ORPCError<'CONFLICT', unknown>>()
      return Effect.succeed('recovered' as const)
    }))
  })

  it('keeps data typed and codes restricted when the channel cannot hold hidden ORPCErrors', () => {
    const withString = {} as Effect.Effect<'output', ORPCError<'NOT_FOUND', { id: string }> | 'boom'>

    void withString.pipe(catchORPCErrorCode('NOT_FOUND', (error) => {
      expectTypeOf(error).toEqualTypeOf<ORPCError<'NOT_FOUND', { id: string }>>()
      expectTypeOf(error.data).toEqualTypeOf<{ id: string }>()
      return Effect.succeed('recovered' as const)
    }))

    // @ts-expect-error - BAD_GATEWAY is not present and the channel cannot hold hidden ORPCErrors
    void withString.pipe(catchORPCErrorCode('BAD_GATEWAY', () => Effect.succeed('recovered')))
  })
})

describe('catchORPCErrorCodes', () => {
  it('narrows each handler and excludes handled codes from the error channel (data-last)', () => {
    const recovered = effect.pipe(catchORPCErrorCodes({
      NOT_FOUND: (error) => {
        expectTypeOf(error).toEqualTypeOf<ORPCError<'NOT_FOUND', { id: string }>>()
        return Effect.succeed('nf' as const)
      },
      CONFLICT: (error) => {
        expectTypeOf(error).toEqualTypeOf<ORPCError<'CONFLICT', number>>()
        return {} as Effect.Effect<'cf', RangeError, Service2>
      },
    }))

    expectTypeOf(recovered).toEqualTypeOf<Effect.Effect<'output' | 'nf' | 'cf', RangeError, Service1 | Service2>>()
  })

  it('keeps unhandled codes in the error channel (data-first)', () => {
    const recovered = catchORPCErrorCodes(effect, {
      NOT_FOUND: (error) => {
        expectTypeOf(error).toEqualTypeOf<ORPCError<'NOT_FOUND', { id: string }>>()
        return Effect.succeed('nf' as const)
      },
    })

    expectTypeOf(recovered).toEqualTypeOf<Effect.Effect<'output' | 'nf', ORPCError<'CONFLICT', number>, Service1>>()
  })

  it('suggests and restricts keys to the codes present in the error channel', () => {
    // @ts-expect-error - BAD_GATEWAY is not present in the error channel (data-last)
    void effect.pipe(catchORPCErrorCodes({ BAD_GATEWAY: () => Effect.succeed('recovered') }))

    // @ts-expect-error - BAD_GATEWAY is not present in the error channel (data-first)
    void catchORPCErrorCodes(effect, { BAD_GATEWAY: () => Effect.succeed('recovered') })
  })

  it('widens data to unknown and accepts undeclared keys when the channel can hold hidden ORPCErrors', () => {
    const recovered = effectWithHidden.pipe(catchORPCErrorCodes({
      NOT_FOUND: (error) => {
        expectTypeOf(error.data).toEqualTypeOf<unknown>()
        return Effect.succeed('nf' as const)
      },
      CONFLICT: (error) => {
        expectTypeOf(error).toEqualTypeOf<ORPCError<'CONFLICT', unknown>>()
        return Effect.succeed('cf' as const)
      },
    }))

    expectTypeOf(recovered).toEqualTypeOf<Effect.Effect<'output' | 'nf' | 'cf', Error, Service1>>()
  })

  it('keeps data typed and keys restricted when the channel cannot hold hidden ORPCErrors', () => {
    const withString = {} as Effect.Effect<'output', ORPCError<'NOT_FOUND', { id: string }> | 'boom'>

    void withString.pipe(catchORPCErrorCodes({
      NOT_FOUND: (error) => {
        expectTypeOf(error).toEqualTypeOf<ORPCError<'NOT_FOUND', { id: string }>>()
        expectTypeOf(error.data).toEqualTypeOf<{ id: string }>()
        return Effect.succeed('recovered' as const)
      },
    }))

    // @ts-expect-error - BAD_GATEWAY is not present and the channel cannot hold hidden ORPCErrors
    void withString.pipe(catchORPCErrorCodes({ BAD_GATEWAY: () => Effect.succeed('recovered') }))
  })
})
