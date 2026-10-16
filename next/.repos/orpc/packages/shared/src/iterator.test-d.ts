import type { PromiseWithError } from './types'
import { consumeAsyncIterator } from './iterator'

describe('consumeAsyncIterator', () => {
  it('can infer types from PromiseWithError + AsyncGenerator', () => {
    void consumeAsyncIterator({} as PromiseWithError<AsyncGenerator<'message-value', 'done-value'>, 'error-value'>, {
      onEvent: (message) => {
        expectTypeOf(message).toEqualTypeOf<'message-value'>()
      },
      onError: (error) => {
        expectTypeOf(error).toEqualTypeOf<'error-value' | Error>()
      },
      onSuccess: (value) => {
        expectTypeOf(value).toEqualTypeOf<'done-value' | undefined>()
      },
      onFinish: ([error, data, isSuccess]) => {
        if (!error || isSuccess) {
          expectTypeOf(error).toEqualTypeOf<null>()
          expectTypeOf(data).toEqualTypeOf<'done-value' | undefined>()
        }
        else {
          expectTypeOf(error).toEqualTypeOf<'error-value' | Error>()
          expectTypeOf(data).toEqualTypeOf<undefined>()
        }
      },
    })
  })

  it('can infer types from AsyncIterator', () => {
    void consumeAsyncIterator({} as AsyncIterator<'message-value', 'done-value'>, {
      onEvent: (message) => {
        expectTypeOf(message).toEqualTypeOf<'message-value'>()
      },
      onError: (error) => {
        expectTypeOf(error).toEqualTypeOf<Error>()
      },
      onSuccess: (value) => {
        expectTypeOf(value).toEqualTypeOf<'done-value' | undefined>()
      },
      onFinish: ([error, data, isSuccess]) => {
        if (!error || isSuccess) {
          expectTypeOf(error).toEqualTypeOf<null>()
          expectTypeOf(data).toEqualTypeOf<'done-value' | undefined>()
        }
        else {
          expectTypeOf(error).toEqualTypeOf<Error>()
          expectTypeOf(data).toEqualTypeOf<undefined>()
        }
      },
    })
  })
})
