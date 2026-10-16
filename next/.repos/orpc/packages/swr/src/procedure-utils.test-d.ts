import type { Client, ORPCError } from '@orpc/client'
import type { Public } from '@orpc/shared'
import type { OperationKey } from './key'
import type { ProcedureUtils } from './procedure-utils'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'
import useSWRMutation from 'swr/mutation'
import useSWRSubscription from 'swr/subscription'

describe('procedureUtils', () => {
  type UtilsInput = { search?: string, cursor?: number } | undefined
  type UtilsOutput = { title: string }[]
  type UtilsError = ORPCError<'BASE', { output: string }> | Error
  const condition = {} as boolean

  const optionalUtils = {} as Public<ProcedureUtils<
    { batch?: boolean },
    UtilsInput,
    UtilsOutput,
    UtilsError
  >>

  const requiredUtils = {} as Public<ProcedureUtils<
    { batch: boolean },
    'input',
    UtilsOutput,
    Error
  >>

  const streamUtils = {} as Public<ProcedureUtils<
    { batch?: boolean },
    UtilsInput,
    AsyncIterable<UtilsOutput[number]>,
    UtilsError
  >>

  it('.call', () => {
    expectTypeOf(optionalUtils.call).toEqualTypeOf<
      Client<{ batch?: boolean }, UtilsInput, UtilsOutput, UtilsError>
    >()
  })

  describe('.key', () => {
    it('should handle optional `input` correctly', () => {
      optionalUtils.key()
      optionalUtils.key({ })
      optionalUtils.key({ input: { search: 'search' } })
    })

    it('should handle required `input` correctly', () => {
      // @ts-expect-error - `input` is required
      requiredUtils.key()
    })

    it('should infer types for `input` correctly', () => {
      optionalUtils.key({ input: { cursor: 1 } })
      // @ts-expect-error - Should error on invalid input type
      optionalUtils.key({ input: { cursor: 'invalid' } })
      // @ts-expect-error - Should error on non-existent input property
      optionalUtils.key({ input: { cursor: 1, nonExistent: true } })

      requiredUtils.key({ input: 'input' })
      // @ts-expect-error - Should error on invalid input type
      requiredUtils.key({ input: 123 })
    })

    it('return valid key', () => {
      expectTypeOf(optionalUtils.key()).toEqualTypeOf<OperationKey<UtilsInput>>()
      expectTypeOf(optionalUtils.key({ input: { search: 'search' } })).toEqualTypeOf<OperationKey<UtilsInput>>()
    })
  })

  describe('.fetcher & useSWR & useSWRInfinite', () => {
    it('require matching key', () => {
      useSWR(optionalUtils.key(), optionalUtils.fetcher())
      // FIXME: This should be an error, but SWR does not enforce key type
      useSWR('invalid', optionalUtils.fetcher())

      useSWRInfinite((index, previousPage) => {
        // FIXME: This should be typed
        // expectTypeOf(previousPage).toEqualTypeOf<UtilsOutput | undefined>()

        return optionalUtils.key()
      }, optionalUtils.fetcher())
      // FIXME: This should be an error, but SWR does not enforce key type
      useSWRInfinite(() => 'invalid', optionalUtils.fetcher())
    })

    it('allow use `null` as key', () => {
      useSWR(condition ? null : optionalUtils.key(), optionalUtils.fetcher())
      useSWRInfinite(() => condition ? null : optionalUtils.key(), optionalUtils.fetcher())
    })

    it('should infer types for `context` correctly', () => {
      optionalUtils.fetcher()
      optionalUtils.fetcher({ context: { batch: true } })
      // @ts-expect-error - Should error on non-existent context property
      optionalUtils.fetcher({ context: { batch: true, nonExistent: true } })
      // @ts-expect-error - Should error on invalid context type
      optionalUtils.fetcher({ context: { batch: 'invalid' } })

      // @ts-expect-error - should require provided context if contains non-optional fields
      requiredUtils.fetcher()
      requiredUtils.fetcher({ context: { batch: true } })
      // @ts-expect-error - Should error on non-existent context property
      requiredUtils.fetcher({ context: { batch: true, nonExistent: true } })
      // @ts-expect-error - Should error on invalid context type
      requiredUtils.fetcher({ context: { batch: 'invalid' } })
    })

    it('should infer types for `output` and `error` correctly', () => {
      const swr = useSWR(optionalUtils.key(), optionalUtils.fetcher())
      expectTypeOf(swr.data).toEqualTypeOf<UtilsOutput | undefined>()
      // FIXME: this should be typed
      // expectTypeOf(swr.error).toEqualTypeOf<UtilsError | undefined>()

      const infinite = useSWRInfinite((index, previousPage) => optionalUtils.key(), optionalUtils.fetcher())
      expectTypeOf(infinite.data).toEqualTypeOf<UtilsOutput[] | undefined>()
      // FIXME: this should be typed
      // expectTypeOf(infinite.error).toEqualTypeOf<UtilsError | undefined>()
    })
  })

  describe('.subscriber & useSWRSubscription', () => {
    it('require matching key', () => {
      useSWRSubscription(optionalUtils.key(), optionalUtils.subscriber())
      // @ts-expect-error - Should error on invalid key type
      useSWRSubscription('invalid', optionalUtils.subscriber())
    })

    it('allow use `null` as key', () => {
      useSWRSubscription(condition ? null : optionalUtils.key(), optionalUtils.subscriber())
    })

    it('should infer types for `context` correctly', () => {
      optionalUtils.subscriber()
      optionalUtils.subscriber({ context: { batch: true } })
      // @ts-expect-error - Should error on non-existent context property
      optionalUtils.subscriber({ context: { batch: true, nonExistent: true } })
      // @ts-expect-error - Should error on invalid context type
      optionalUtils.subscriber({ context: { batch: 'invalid' } })

      // @ts-expect-error - should require provided context if contains non-optional fields
      requiredUtils.subscriber()
      requiredUtils.subscriber({ context: { batch: true } })
      // @ts-expect-error - Should error on non-existent context property
      requiredUtils.subscriber({ context: { batch: true, nonExistent: true } })
      // @ts-expect-error - Should error on invalid context type
      requiredUtils.subscriber({ context: { batch: 'invalid' } })
    })

    it('should infer types for `output` and `error` correctly', () => {
      const subscription = useSWRSubscription(streamUtils.key(), streamUtils.subscriber({ maxChunks: 5 }))
      expectTypeOf(subscription.data).toEqualTypeOf<UtilsOutput | undefined>()
      expectTypeOf(subscription.error).toEqualTypeOf<UtilsError | undefined>()
    })
  })

  describe('.liveSubscriber & useSWRSubscription', () => {
    it('require matching key', () => {
      useSWRSubscription(optionalUtils.key(), optionalUtils.liveSubscriber())
      // @ts-expect-error - Should error on invalid key type
      useSWRSubscription('invalid', optionalUtils.liveSubscriber())
    })

    it('allow use `null` as key', () => {
      useSWRSubscription(condition ? null : optionalUtils.key(), optionalUtils.liveSubscriber())
    })

    it('should infer types for `context` correctly', () => {
      optionalUtils.liveSubscriber()
      optionalUtils.liveSubscriber({ context: { batch: true } })
      // @ts-expect-error - Should error on non-existent context property
      optionalUtils.liveSubscriber({ context: { batch: true, nonExistent: true } })
      // @ts-expect-error - Should error on invalid context type
      optionalUtils.liveSubscriber({ context: { batch: 'invalid' } })

      // @ts-expect-error - should require provided context if contains non-optional fields
      requiredUtils.liveSubscriber()
      requiredUtils.liveSubscriber({ context: { batch: true } })
      // @ts-expect-error - Should error on non-existent context property
      requiredUtils.liveSubscriber({ context: { batch: true, nonExistent: true } })
      // @ts-expect-error - Should error on invalid context type
      requiredUtils.liveSubscriber({ context: { batch: 'invalid' } })
    })

    it('should infer types for `output` and `error` correctly', () => {
      const subscription = useSWRSubscription(streamUtils.key(), streamUtils.liveSubscriber())
      expectTypeOf(subscription.data).toEqualTypeOf<UtilsOutput[number] | undefined>()
      expectTypeOf(subscription.error).toEqualTypeOf<UtilsError | undefined>()
    })
  })

  describe('.mutator & useSWRMutation', () => {
    it('should infer types for `context` correctly', () => {
      optionalUtils.mutator()
      optionalUtils.mutator({ context: { batch: true } })
      // @ts-expect-error - Should error on non-existent context property
      optionalUtils.mutator({ context: { batch: true, nonExistent: true } })
      // @ts-expect-error - Should error on invalid context type
      optionalUtils.mutator({ context: { batch: 'invalid' } })

      // @ts-expect-error - should require provided context if contains non-optional fields
      requiredUtils.mutator()
      requiredUtils.mutator({ context: { batch: true } })
      // @ts-expect-error - Should error on non-existent context property
      requiredUtils.mutator({ context: { batch: true, nonExistent: true } })
      // @ts-expect-error - Should error on invalid context type
      requiredUtils.mutator({ context: { batch: 'invalid' } })
    })

    it('should infer types for `output` & `input` & `error` correctly', () => {
      const mutation = useSWRMutation('some-key', optionalUtils.mutator())

      expectTypeOf<Parameters<typeof mutation.trigger>[0]>().toEqualTypeOf<UtilsInput | undefined>()
      expectTypeOf(mutation.data).toEqualTypeOf<UtilsOutput | undefined>()
      // FIXME: this should be typed
      // expectTypeOf(mutation.error).toEqualTypeOf<UtilsError | undefined>()
    })
  })
})
