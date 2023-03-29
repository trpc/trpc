/**
 * `query`
 * Refers to both svelte-query and a type of tRPC procedure.
 * This file maps tRPC procedures to svelte-query functions,
 * e.g. `query` to `createQuery`, `mutation` to `createMutation`, etc.
 */

// import type { Writable } from 'svelte/store'
import type { TRPCClientError, TRPCClientErrorLike, TRPCRequestOptions } from '@trpc/client'
import type { TRPCSubscriptionObserver } from '@trpc/client/dist/internals/TRPCUntypedClient'
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  AnySubscriptionProcedure,
  inferProcedureInput,
} from '@trpc/server'
import type { Unsubscribable } from '@trpc/server/observable'
import type { inferTransformedProcedureOutput, inferTransformedSubscriptionOutput } from '@trpc/server/shared'
import type {
  CreateQueryOptions,
  CreateQueryResult,
  CreateInfiniteQueryOptions,
  CreateInfiniteQueryResult,
  CreateMutationOptions,
  CreateMutationResult,
} from '@tanstack/svelte-query'
import { CreateQueriesResult, QueriesOptions } from '@tanstack/svelte-query/build/lib/createQueries'
import type { InfiniteQueryInput, TRPCOptions } from './types'
import type { MaybeWritable } from './reactive'

/**
 * Map a tRPC `query` procedure to svelte-query methods.
 */
type TRPCQueryProcedure<T extends AnyProcedure> = {
  createQuery: (
    input: MaybeWritable<inferProcedureInput<T>>,
    opts?: CreateQueryOptions<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>> & TRPCOptions
  ) => CreateQueryResult<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>>

  /**
   * Used inside `createQueries` to get the options needed to create the query.
   */
  getQueryOptions: (
    input: MaybeWritable<inferProcedureInput<T>>,
    opts?: CreateQueryOptions<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>> & TRPCOptions
  ) => CreateQueryOptions<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>> & TRPCOptions
} & MaybeInfiniteQueryProcedure<T>

/**
 * Additional svelte-query methods available to infinite queries.
 */
type MaybeInfiniteQueryProcedure<T extends AnyProcedure> = inferProcedureInput<T> extends InfiniteQueryInput
  ? {
      createInfiniteQuery: (
        input: MaybeWritable<inferProcedureInput<T>>,
        opts?: CreateInfiniteQueryOptions<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>> & TRPCOptions
      ) => CreateInfiniteQueryResult<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>>
    }
  : object

/**
 * Map a tRPC `mutation` procedure to svelte-query methods.
 */
type TRPCMutationProcedure<T extends AnyProcedure> = {
  createMutation: (
    opts?: CreateMutationOptions<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>, inferProcedureInput<T>> &
      TRPCOptions
  ) => CreateMutationResult<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>, inferProcedureInput<T>>
}

/**
 * Map a tRPC `subscription` procedure to svelte-query methods.
 */
type TRPCSubscriptionProcedure<T extends AnyProcedure> = {
  createSubscription: (
    input: inferProcedureInput<T>,
    opts?: TRPCRequestOptions &
      Partial<TRPCSubscriptionObserver<inferTransformedSubscriptionOutput<T>, TRPCClientError<T>>>
  ) => Unsubscribable
}

/**
 * Map tRPC procedure to svelte-query methods.
 */
type TRPCSvelteQueryProcedure<T> = T extends AnyQueryProcedure
  ? TRPCQueryProcedure<T>
  : T extends AnyMutationProcedure
  ? TRPCMutationProcedure<T>
  : T extends AnySubscriptionProcedure
  ? TRPCSubscriptionProcedure<T>
  : never

/**
 * Convert tRPC router to trpc + svelte-query router. This is the shape of the proxy.
 */
export type TRPCSvelteQueryRouter<T extends AnyRouter> = {
  [k in keyof T]: T[k] extends AnyRouter ? TRPCSvelteQueryRouter<T[k]> : TRPCSvelteQueryProcedure<T[k]>
}

/**
 * Create multiple queries.
 */
export type CreateQueries<T extends AnyRouter> = <Options extends CreateQueryOptions<any, any>[]>(
  callback: (t: TRPCSvelteQueryRouter<T>) => readonly [...Options]
) => CreateQueriesResult<QueriesOptions<Options>>
