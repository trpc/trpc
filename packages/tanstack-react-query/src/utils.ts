import type { QueryClient } from '@tanstack/react-query';
import type { TRPCQueryKey } from './queryKey';
import type { TRPCQueryOptionsResult } from './types';

/**
 * @internal
 */
export function createTRPCOptionsResult(value: {
  path: readonly string[];
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
  queryKey: TRPCQueryKey,
  opts: TOptions,
  infiniteParams?: {
    pageParam: any;
    direction: 'forward' | 'backward';
  },
) {
  const path = queryKey[0];
  let input = queryKey[1]?.input;
  if (infiniteParams) {
    input = {
      ...(input ?? {}),
      ...(infiniteParams.pageParam ? { cursor: infiniteParams.pageParam } : {}),
      direction: infiniteParams.direction,
    };
  }
  return [path.join('.'), input, (opts as any)?.trpc] as const;
}

/**
 * @internal
 */
export async function buildQueryFromAsyncIterable(
  asyncIterable: AsyncIterable<unknown>,
  queryClient: QueryClient,
  queryKey: TRPCQueryKey,
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
