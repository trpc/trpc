import type { Client, ClientContext } from '@orpc/client'
import type { MaybeOptionalOptions } from '@orpc/shared'
import type { OperationKey, OperationKeyOptions, OperationKeyPrefixOptions } from './key'
import type {
  Fetcher,
  FetcherOptions,
  InferLiveSubscriberOutput,
  InferSubscriberOutput,
  KeyOptions,
  Mutator,
  MutatorOptions,
  OperationContext,
  Subscriber,
  SubscriberOptions,
} from './types'
import { isAsyncIteratorObject, resolveMaybeOptionalOptions } from '@orpc/shared'
import { generateOperationKey } from './key'
import { SharedUtils } from './shared-utils'
import { OPERATION_CONTEXT_SYMBOL } from './types'

export interface ProcedureUtilsOptions extends OperationKeyPrefixOptions {
}

export class ProcedureUtils<TClientContext extends ClientContext, TInput, TOutput, TError> extends SharedUtils<TInput> {
  /**
   * Calling corresponding procedure client
   *
   * @see {@link https://orpc.dev/docs/integrations/swr#calling-clients | SWR Integration - Calling Clients}
   */
  call: Client<TClientContext, TInput, TOutput, TError>

  constructor(
    path: string[],
    client: Client<TClientContext, TInput, TOutput, TError>,
    options: ProcedureUtilsOptions = {},
  ) {
    super(path, options)
    this.call = client
  }

  /**
   * Generate a **full matching** key for SWR operations.
   *
   * @see {@link https://orpc.dev/docs/integrations/swr#data-fetching | SWR Integration - Data Fetching}
   */
  key(
    ...rest: MaybeOptionalOptions<KeyOptions<TInput>>
  ): OperationKey<TInput> {
    const options = resolveMaybeOptionalOptions(rest)

    return generateOperationKey(this.path, { ...options, prefix: this.options.prefix } as OperationKeyOptions<TInput>)
  }

  /**
   * Generate a fetcher function for use with useSWR, useSWRInfinite, and other SWR hooks.
   *
   * @see {@link https://orpc.dev/docs/integrations/swr#data-fetching | SWR Integration - Data Fetching}
   */
  fetcher(
    ...rest: MaybeOptionalOptions<FetcherOptions<TClientContext>>
  ): Fetcher<TInput, TOutput> {
    const options = resolveMaybeOptionalOptions(rest)

    return async (key) => {
      /**
       * Input can be omitted from the key when it is undefined,
       * so we can safely cast it to TInput with an undefined fallback.
       */
      const { input } = key[key.length - 1] as { input: TInput }

      return this.call(input, {
        context: {
          [OPERATION_CONTEXT_SYMBOL]: { key, type: 'fetcher' },
          ...options.context,
        } satisfies OperationContext as any,
      })
    }
  }

  /**
   * Generate a subscriber function that subscribes to an [AsyncIteratorObject](https://orpc.dev/docs/async-iterator-object) for use with useSWRSubscription, etc.
   *
   * @see {@link https://orpc.dev/docs/integrations/swr#subscriptions | SWR Integration - Subscriptions}
   */
  subscriber(
    ...rest: MaybeOptionalOptions<SubscriberOptions<TClientContext>>
  ): Subscriber<TInput, InferSubscriberOutput<TOutput>, TError> {
    const { maxChunks, refetchMode = 'reset', ...options } = resolveMaybeOptionalOptions(rest)

    return (key, { next }) => {
      const controller = new AbortController()

      void (async () => {
        try {
          /**
           * Input can be omitted from the key when it is undefined,
           * so we can safely cast it to TInput with an undefined fallback.
           */
          const { input } = key[key.length - 1] as { input: TInput }

          const iterator = await this.call(input, {
            context: {
              [OPERATION_CONTEXT_SYMBOL]: { key, type: 'subscriber' },
              ...options.context,
            } satisfies OperationContext as any,
            signal: controller.signal,
          })

          if (!isAsyncIteratorObject(iterator)) {
            throw new TypeError('.subscriber requires an AsyncIteratorObject output')
          }

          if (controller.signal.aborted) {
            await iterator.return?.()
            return
          }

          let hasPreviousData = false

          if (refetchMode === 'reset') {
            next(undefined, undefined)
          }
          else if (refetchMode === 'replace') {
            /**
             * The updater is invoked synchronously with the current data,
             * so we can use it to detect whether previous data exists.
             */
            next(undefined, (old) => {
              hasPreviousData = old !== undefined
              return old as InferSubscriberOutput<TOutput>
            })
          }

          const shouldUpdateDataDuringStream = refetchMode !== 'replace' || !hasPreviousData
          let buffer: unknown[] = []

          for await (const event of iterator) {
            if (controller.signal.aborted) {
              break
            }

            if (shouldUpdateDataDuringStream) {
              next(undefined, (old) => {
                const newData = Array.isArray(old) ? [...old, event] : [event]

                if (typeof maxChunks === 'number' && newData.length > maxChunks) {
                  return newData.slice(newData.length - maxChunks) as InferSubscriberOutput<TOutput>
                }

                return newData as InferSubscriberOutput<TOutput>
              })
            }
            else {
              buffer = [...buffer, event]

              if (typeof maxChunks === 'number' && buffer.length > maxChunks) {
                buffer = buffer.slice(buffer.length - maxChunks)
              }
            }
          }

          if (!shouldUpdateDataDuringStream && !controller.signal.aborted) {
            next(undefined, buffer as InferSubscriberOutput<TOutput>)
          }
        }
        catch (error) {
          /**
           * Only report the error if the controller is not aborted.
           */
          if (!controller.signal.aborted) {
            next(error as TError)
          }
        }
      })()

      return () => {
        controller.abort()
      }
    }
  }

  /**
   * Generate a live subscriber that subscribes to the latest events from an [AsyncIteratorObject](https://orpc.dev/docs/async-iterator-object) for use with useSWRSubscription, etc.
   *
   * @see {@link https://orpc.dev/docs/integrations/swr#subscriptions | SWR Integration - Subscriptions}
   */
  liveSubscriber(
    ...rest: MaybeOptionalOptions<FetcherOptions<TClientContext>>
  ): Subscriber<TInput, InferLiveSubscriberOutput<TOutput>, TError> {
    const options = resolveMaybeOptionalOptions(rest)

    return (key, { next }) => {
      const controller = new AbortController()

      void (async () => {
        try {
          /**
           * Input can be omitted from the key when it is undefined,
           * so we can safely cast it to TInput with an undefined fallback.
           */
          const { input } = key[key.length - 1] as { input: TInput }

          const iterator = await this.call(input, {
            context: {
              [OPERATION_CONTEXT_SYMBOL]: { key, type: 'liveSubscriber' },
              ...options.context,
            } satisfies OperationContext as any,
            signal: controller.signal,
          })

          if (!isAsyncIteratorObject(iterator)) {
            throw new TypeError('.liveSubscriber requires an AsyncIteratorObject output')
          }

          for await (const event of iterator) {
            if (controller.signal.aborted) {
              break
            }

            next(undefined, event as InferLiveSubscriberOutput<TOutput>)
          }
        }
        catch (error) {
          /**
           * Only report the error if the controller is not aborted.
           */
          if (!controller.signal.aborted) {
            next(error as TError)
          }
        }
      })()

      return () => {
        controller.abort()
      }
    }
  }

  /**
   * Generate a mutator function for use with useSWRMutation, etc.
   *
   * @see {@link https://orpc.dev/docs/integrations/swr#mutations | SWR Integration - Mutations}
   */
  mutator(
    ...rest: MaybeOptionalOptions<MutatorOptions<TClientContext>>
  ): Mutator<TInput, TOutput> {
    const options = resolveMaybeOptionalOptions(rest)

    return (key, { arg }) => this.call(arg, {
      context: {
        [OPERATION_CONTEXT_SYMBOL]: { key, type: 'mutator' },
        ...options.context,
      } satisfies OperationContext as any,
    })
  }
}
