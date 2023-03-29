/**
 * `utils`
 * Methods that operate directly on the `QueryClient`, usually on behalf of a tRPC procedure.
 * They'll actually be directly accessible from the same path as `createQuery`,
 * but splitting it up makes the autocomplete easier to work with.
 *
 * e.g. `trpc.utils.users.fetch()` and `trpc.users.fetch()` are both valid calls,
 * but only the former is recognized by TypeScript.
 *
 * It might seem that the infinite query has duplicate types with regular query;
 * the slightly different method names are used to construct different query keys during runtime.
 */

import type { TRPCClientErrorLike } from '@trpc/client'
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  AnySubscriptionProcedure,
  inferProcedureInput,
} from '@trpc/server'
import type { inferTransformedProcedureOutput } from '@trpc/server/shared'
import type {
  InvalidateQueryFilters,
  InvalidateOptions,
  FetchQueryOptions,
  ResetOptions,
  QueryFilters,
  Updater,
  CancelOptions,
  SetDataOptions,
  QueryState,
  RefetchOptions,
} from '@tanstack/svelte-query'
import type { QueryKey } from './getQueryKey'
import type { InfiniteQueryInput, TRPCOptions } from './types'

/**
 * Map a tRPC `query` procedure to utilities.
 */
export type QueryUtilsProcedure<T extends AnyProcedure> = {
  /**
   * Get the automatically generated query key for the query procedure.
   */
  getQueryKey(input: inferProcedureInput<T>): QueryKey

  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientfetchquery
   * @param input The procedure input.
   * @param options Options forwarded to `fetchQuery`.
   */
  fetch(
    input: inferProcedureInput<T>,
    options?: FetchQueryOptions<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>> & TRPCOptions
  ): Promise<inferTransformedProcedureOutput<T>>

  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientprefetchquery
   * @param input The procedure input.
   * @param options Options forwarded to `prefetchQuery`.
   */
  prefetch(
    input: inferProcedureInput<T>,
    options?: FetchQueryOptions<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>> & TRPCOptions
  ): Promise<void>

  /**
   * Get the cached procedure output if it exists.
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientgetquerydata
   */
  getData(input: inferProcedureInput<T>): inferTransformedProcedureOutput<T> | undefined

  /**
   * Get the cached procedure output; call `fetchQuery` and return the results if cache miss.
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientensurequerydata
   */
  ensureData(
    input: inferProcedureInput<T>,
    options?: FetchQueryOptions<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>>
  ): Promise<inferTransformedProcedureOutput<T>>

  /**
   * Set a query procedure's cached data.
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientsetquerydata
   * @param input The procedure input or an updater function that transforms the previous input.
   * @param options Options forwarded to `setQueryData`.
   */
  setData(
    input: Updater<inferProcedureInput<T>, inferTransformedProcedureOutput<T>>,
    options?: SetDataOptions
  ): Promise<void>

  /**
   * Get the state of a query procedure.
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientgetquerystate
   * @param input The procedure input.
   * @param filters Filters forwarded to `getQueryState`.
   */
  getState(
    input: inferProcedureInput<T>
  ): QueryState<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>> | undefined

  /**
   * Invalidate all query procedures at the current level and below.
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientinvalidatequeries
   */
  invalidate(filters?: InvalidateQueryFilters, options?: InvalidateOptions): Promise<void>

  /**
   * Refetch all query procedures at the current level and below.
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientrefetchqueries
   */
  refetch(filters?: QueryFilters, options?: RefetchOptions): Promise<void>

  /**
   * Cancel all query procedures at the current level and below.
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientcancelqueries
   */
  cancel(filters?: QueryFilters, options?: CancelOptions): Promise<void>

  /**
   * Remove all query procedures at the current level and below.
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientremovequeries
   */
  remove(filters?: QueryFilters): void

  /**
   * Reset all query procedures at the current level and below.
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientresetqueries
   */
  reset(filters?: QueryFilters, options?: ResetOptions): Promise<void>

  /**
   * Number of queries in progress, for the specified input and current route.
   */
  isFetching(input: inferProcedureInput<T>): number

  /**
   * Number of queries in progress, for the current route and sub-routes.
   */
  isFetchingRecursive(): number
} & MaybeInfiniteUtilsProcedure<T>

/**
 * Additional utilities available to infinite queries.
 */
export type MaybeInfiniteUtilsProcedure<T extends AnyProcedure> = inferProcedureInput<T> extends InfiniteQueryInput
  ? {
      /**
       * Get the automatically generated query key for the infinite query procedure.
       */
      getInfiniteQueryKey(input: inferProcedureInput<T>): QueryKey

      /**
       * Fetch, cache, and return the results of an infinite query.
       * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientfetchinfinitequery
       * @param input The input to the procedure.
       * @param options Options forwarded to `fetchInfiniteQuery`.
       * @returns The procedure response.
       */
      fetchInfinite(
        input: inferProcedureInput<T>,
        options?: FetchQueryOptions<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>> & TRPCOptions
      ): Promise<inferTransformedProcedureOutput<T>>

      /**
       * Fetch and cache the results of an infinite query.
       * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientprefetchinfinitequery
       * @param input The input to the procedure.
       * @param options Options forwarded to `fetchInfiniteQuery`.
       */
      prefetchInfinite(
        input: inferProcedureInput<T>,
        options?: FetchQueryOptions<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>> & TRPCOptions
      ): Promise<void>

      /**
       * Get the cached infinite query data if it exists.
       * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientgetquerydata
       */
      getInfiniteData(input: inferProcedureInput<T>): inferTransformedProcedureOutput<T> | undefined

      /**
       * Get the cached infinite query procedure output; call `fetchInfiniteQuery` and return the results if cache miss.
       * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientensurequerydata
       */
      ensureInfiniteData(
        input: inferProcedureInput<T>,
        options?: FetchQueryOptions<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>>
      ): Promise<inferTransformedProcedureOutput<T>>

      /**
       * Set an infinite query procedure's cached data.
       * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientsetquerydata
       * @param input The procedure input or an updater function that transforms the previous input.
       * @param options Options forwarded to `setQueryData`.
       */
      setInfiniteData(
        input: Updater<inferTransformedProcedureOutput<T> | undefined, inferTransformedProcedureOutput<T> | undefined>,
        options?: SetDataOptions
      ): Promise<void>

      /**
       * Get the state of an infinite query procedure.
       * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientgetquerystate
       * @param input The procedure input.
       * @param filters Filters forwarded to `getQueryState`.
       */
      getInfiniteState(
        input: inferProcedureInput<T>
      ): QueryState<inferTransformedProcedureOutput<T>, TRPCClientErrorLike<T>> | undefined
    }
  : object

/**
 * Map a tRPC `mutation` procedure to utilities.
 */
export type MutationUtilsProcedure = {
  /**
   * Get the automatically generated query key for the mutation procedure.
   */
  getMutationKey(): QueryKey

  /**
   * Number of mutations in progress, for the current route and sub-routes.
   */
  isMutating(): number
}

/**
 * Map a tRPC `subscription` procedure to utilities.
 */
export type SubscriptionUtilsProcedure = {
  /**
   * Get the automatically generated query key for the subscription procedure.
   */
  getSubscriptionKey(): QueryKey
}

/**
 * Map a tRPC procedure to utilites.
 */
// prettier-ignore
export type UtilsProcedure<T> = 
    T extends AnyQueryProcedure ? QueryUtilsProcedure<T> : 
    T extends AnyMutationProcedure ? MutationUtilsProcedure :
    T extends AnySubscriptionProcedure ? SubscriptionUtilsProcedure  : never

/**
 * Properties available at all levels of utilities.
 */
type SharedUtils = {
  invalidate(filters?: InvalidateQueryFilters, opts?: InvalidateOptions): Promise<void>
}

/**
 * Inner utilities router has shared properties, but not root properties.
 */
type InnerUtilsRouter<T extends AnyRouter> = {
  [k in keyof T]: T[k] extends AnyRouter ? InnerUtilsRouter<T[k]> : UtilsProcedure<T[k]>
} & SharedUtils

/**
 * Root properties of a utilities router.
 */
type RootUtilsRouter = SharedUtils & object

/**
 * Convert tRPC router to utilities router.
 */
export type UtilsRouter<T extends AnyRouter> = {
  [k in keyof T]: T[k] extends AnyRouter ? InnerUtilsRouter<T[k]> : UtilsProcedure<T[k]>
} & RootUtilsRouter
