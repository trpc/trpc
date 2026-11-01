/**
 * The option `.agent-docs/open/tanstack-query-abort-opt-out.md` proposes,
 * as types: B and C add `abortWhenUnobserved` to `queryOptions()` (B
 * defaulting to `true`, C to `false`; `infiniteOptions()` would take it
 * too). A is `createTrpcQueryUtils` as it is.
 */
import type { SkipToken } from '@tanstack/react-query';
import type {
  CreateTrpcQueryUtilsOptions,
  PathUtils,
  QueryData,
  QueryOptionsIn,
  QueryOptionsOut,
  TrpcQueryUtils,
} from '@trpc12/tanstack-query';
import type { TrpcPromise } from '@trpc12/trpc/client';

interface AbortOption {
  /** Whether the call aborts once nothing observes the query (TanStack's `signal`). */
  abortWhenUnobserved?: boolean | undefined;
}

type InputBag<TInput> = undefined extends TInput
  ? { input?: TInput | SkipToken }
  : { input: TInput | SkipToken };

type Utils<TClient, TOption> = {
  [K in keyof TClient]: TClient[K] extends {
    query: (input: infer I, ...rest: any[]) => TrpcPromise<infer O, infer E>;
  }
    ? Omit<TrpcQueryUtils<TClient>[K], 'queryOptions'> & {
        queryOptions<TData = QueryData<O>>(
          opts: InputBag<I> &
            QueryOptionsIn<QueryData<O>, NonNullable<E>, TData> &
            TOption,
        ): QueryOptionsOut<QueryData<O>, NonNullable<E>, TData>;
      }
    : TClient[K] extends { mutate: unknown } | { subscribe: unknown }
      ? TrpcQueryUtils<TClient>[K]
      : Utils<TClient[K], TOption>;
};

/** B: `createTrpcQueryUtils`, whose `queryOptions()` take `abortWhenUnobserved` (default `true`). */
export declare function createTrpcQueryUtilsB<TClient extends object>(
  opts: CreateTrpcQueryUtilsOptions<TClient>,
): PathUtils & Utils<TClient, AbortOption>;

/** C: `createTrpcQueryUtils`, whose `queryOptions()` take `abortWhenUnobserved` (default `false`). */
export declare function createTrpcQueryUtilsC<TClient extends object>(
  opts: CreateTrpcQueryUtilsOptions<TClient>,
): PathUtils & Utils<TClient, AbortOption>;
