import type { ClientContext } from '@orpc/client'
import type { PartialDeep } from '@orpc/shared'
import type { SWRSubscriptionOptions } from 'swr/subscription'
import type { OperationKey } from './key'

export type InferSubscriberOutput<TOutput> = TOutput extends AsyncIterable<infer U> ? U[] : never
export type InferLiveSubscriberOutput<TOutput> = TOutput extends AsyncIterable<infer U> ? U : never

export type OperationType = 'fetcher' | 'mutator' | 'subscriber' | 'liveSubscriber'

/**
 * The symbol under which SWR utils attach operation details
 * (key and operation type) to the client context.
 *
 * @see {@link https://orpc.dev/docs/integrations/swr#operation-context | SWR Integration - Operation Context}
 */
export const OPERATION_CONTEXT_SYMBOL: unique symbol = Symbol.for('ORPC_SWR_OPERATION_CONTEXT')

/**
 * A client context automatically populated by SWR utils,
 * exposing the operation key and type of the calling operation.
 *
 * @see {@link https://orpc.dev/docs/integrations/swr#operation-context | SWR Integration - Operation Context}
 */
export interface OperationContext {
  [OPERATION_CONTEXT_SYMBOL]?: {
    key: unknown
    type: OperationType
  }
}

export type KeyOptions<TInput>
  = undefined extends TInput ? { input?: TInput } : { input: TInput }

export type MatcherStrategy = 'exact' | 'partial'

export type MatcherOptions<TStrategy extends MatcherStrategy, TInput>
  = (
    'partial' extends TStrategy
      ? { input?: PartialDeep<TInput> }
      : undefined extends TInput
        ? { input?: TInput }
        : { input: TInput }
  ) & {
    strategy?: TStrategy
  }

export type Matcher = (key?: unknown) => boolean

export type FetcherOptions<TClientContext extends ClientContext>
  = object extends TClientContext ? { context?: TClientContext } : { context: TClientContext }

export type SubscriberOptions<TClientContext extends ClientContext> = FetcherOptions<TClientContext> & {
  /**
   * Determines how data is handled when the subscription is subscribed again
   *
   * - `'reset'`: Clears existing data before streaming new data.
   * - `'append'`: Adds new streamed chunks to the existing data.
   * - `'replace'`: Buffers streamed data and replaces existing data after the stream completes.
   *
   * @default 'reset'
   */
  refetchMode?: 'append' | 'reset' | 'replace'

  /**
   * Maximum number of chunks to store.
   * When exceeded, the oldest chunks will be removed.
   */
  maxChunks?: number
}

export type MutatorOptions<TClientContext extends ClientContext> = FetcherOptions<TClientContext>

export type Fetcher<TInput, TOutput> = (key: OperationKey<TInput>) => Promise<TOutput>

export type Mutator<TInput, TOutput> = (key: unknown, options: Readonly<{ arg: TInput }>) => Promise<TOutput>

export type Subscriber<TInput, TData, TError> = (
  key: OperationKey<TInput>,
  options: SWRSubscriptionOptions<TData, TError>,
) => (() => void)
