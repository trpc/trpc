import type { QueryClient, QueryFunction } from '@tanstack/react-query';
import type { TRPCRequestOptions, TRPCUntypedClient } from '@trpc/client';
import { isAsyncIterable } from '@trpc/server/unstable-core-do-not-import';
import { readQueryKey, type AnyTRPCQueryKey } from './queryKey';

/**
 * tRPC options for a single query or mutation, passed as `trpc`.
 * @public
 */
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

/**
 * Adds the `trpc` option to TanStack Query options.
 * @public
 */
export interface TRPCQueryBaseOptions {
  /**
   * tRPC-related options
   */
  trpc?: TRPCReactRequestOptions;
}

/**
 * Extra fields that tRPC adds to the options it returns.
 * @public
 */
export interface TRPCQueryOptionsResult {
  /**
   * tRPC details about the options, such as the procedure path.
   */
  trpc: {
    /**
     * The dot-separated procedure path, such as `post.byId`.
     */
    path: string;
  };
}

/**
 * @internal
 */
export function createTRPCOptionsResult(value: {
  path: string[];
}): TRPCQueryOptionsResult['trpc'] {
  const path = value.path.join('.');

  return {
    path,
  };
}

/**
 * @internal
 */
export function getClientArgs<TOptions>(
  queryKey: AnyTRPCQueryKey,
  opts: TOptions,
  infiniteParams?: {
    pageParam: any;
    direction: 'forward' | 'backward';
  },
) {
  const queryKeyData = readQueryKey(queryKey);

  let input = queryKeyData.args?.input;
  if (infiniteParams) {
    input = {
      ...(queryKeyData.args?.input ?? {}),
      ...(infiniteParams.pageParam !== undefined
        ? { cursor: infiniteParams.pageParam }
        : {}),
      direction: infiniteParams.direction,
    };
  }
  return [queryKeyData.path.join('.'), input, (opts as any)?.trpc] as const;
}

/**
 * @internal
 */
export async function buildQueryFromAsyncIterable<
  TQueryKey extends AnyTRPCQueryKey,
>(
  asyncIterable: AsyncIterable<unknown>,
  queryClient: QueryClient,
  queryKey: TQueryKey,
) {
  const queryCache = queryClient.getQueryCache();

  const query = queryCache.build(queryClient, {
    queryKey,
  });

  query.setState({
    data: [],
    status: 'success',
  });

  const aggregate: unknown[] = [];
  for await (const value of asyncIterable) {
    aggregate.push(value);

    query.setState({
      data: [...aggregate],
    });
  }
  return aggregate;
}

/**
 * @internal
 */
export type QueryCall = typeof TRPCUntypedClient.prototype.query;

function requestOptions(
  trpc: TRPCReactRequestOptions | undefined,
  signal: AbortSignal,
) {
  return {
    trpc: {
      ...trpc,
      ...(trpc?.abortOnUnmount ? { signal } : { signal: null }),
    },
  };
}

/**
 * The `queryFn` of a query's options
 * @internal
 */
export function createQueryFn(args: {
  query: QueryCall;
  queryClient: QueryClient;
  trpc: TRPCReactRequestOptions | undefined;
}): QueryFunction<unknown, AnyTRPCQueryKey> {
  return async (context) => {
    const queryKey = context.queryKey;
    const result = await args.query(
      ...getClientArgs(queryKey, requestOptions(args.trpc, context.signal)),
    );
    if (isAsyncIterable(result)) {
      return buildQueryFromAsyncIterable(result, args.queryClient, queryKey);
    }
    return result;
  };
}

/**
 * The `queryFn` of an infinite query's options
 * @internal
 */
export function createInfiniteQueryFn(args: {
  query: QueryCall;
  queryKey: AnyTRPCQueryKey;
  trpc: TRPCReactRequestOptions | undefined;
}): QueryFunction<unknown, AnyTRPCQueryKey, unknown> {
  return (context) =>
    args.query(
      ...getClientArgs(
        args.queryKey,
        requestOptions(args.trpc, context.signal),
        { direction: context.direction, pageParam: context.pageParam },
      ),
    );
}
