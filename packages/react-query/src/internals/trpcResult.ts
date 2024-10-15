import type { QueryClient } from '@tanstack/react-query';
import * as React from 'react';
import type { TRPCQueryOptionsResult } from '../shared';
import type { TRPCHookResult } from '../shared/hooks/types';
import type { TRPCQueryKey } from './getQueryKey';

export function createTRPCOptionsResult(value: {
  path: readonly string[];
}): TRPCQueryOptionsResult['trpc'] {
  const path = value.path.join('.');

  return {
    path,
  };
}

/**
 * Makes a stable reference of the `trpc` prop
 */
export function useHookResult(value: {
  path: readonly string[];
}): TRPCHookResult['trpc'] {
  const result = createTRPCOptionsResult(value);
  return React.useMemo(() => result, [result]);
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
