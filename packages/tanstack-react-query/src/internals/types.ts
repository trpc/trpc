import type {
  DataTag,
  FetchStatus,
  Query,
  QueryKey,
} from '@tanstack/react-query';
import type { TRPCRequestOptions } from '@trpc/client';

export type ResolverDef = {
  input: any;
  output: any;
  transformer: boolean;
  errorShape: any;
};

export type ExtractCursorType<TInput> = TInput extends { cursor?: any }
  ? TInput['cursor']
  : unknown;

export interface TRPCReactRequestOptions
  // For RQ, we use their internal AbortSignals instead of letting the user pass their own
  extends Omit<TRPCRequestOptions, 'signal'> {
  /**
   * Opt out of SSR for this query by passing `ssr: false`
   */
  ssr?: boolean;
  /**
   * Opt out or into aborting request on unmount
   */
  abortOnUnmount?: boolean;
}

export interface TRPCQueryBaseOptions {
  /**
   * tRPC-related options
   */
  trpc?: TRPCReactRequestOptions;
}

export interface TRPCQueryOptionsResult {
  trpc: {
    path: string;
  };
}

export type QueryType = 'any' | 'infinite' | 'query';

export type TRPCQueryKey = [
  readonly string[],
  { input?: unknown; type?: Exclude<QueryType, 'any'> }?,
];

export type TRPCMutationKey = [readonly string[]]; // = [TRPCQueryKey[0]]

/**
 * May be temporary if this can merge:
 * @see https://github.com/TanStack/query/pull/8332
 */
export interface TRPCQueryFilters<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> {
  /**
   * Filter to active queries, inactive queries or all queries
   */
  type?: 'all' | 'active' | 'inactive';
  /**
   * Match query key exactly
   */
  exact?: boolean;
  /**
   * Include queries matching this predicate function
   */
  predicate?: (query: Query<TQueryFnData, TError, TData, TQueryKey>) => boolean;
  /**
   * Include queries matching this query key
   */
  queryKey?: unknown extends TQueryFnData
    ? QueryKey
    : QueryKey & DataTag<unknown, TQueryFnData>;
  /**
   * Include or exclude stale queries
   */
  stale?: boolean;
  /**
   * Include queries matching their fetchStatus
   */
  fetchStatus?: FetchStatus;
}
