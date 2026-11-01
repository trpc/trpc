import { hashKey, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import type { DecorateQueryProcedure } from './createOptionsProxy';
import type {
  unstable_TRPCPrefetchOptions,
  unstable_TRPCQueryHandle,
} from './handles';
import { startHandle } from './handles';
import type { ResolverDef } from './types';

/**
 * Start a query during render and return a handle for it, for inputs that are only known
 * at render time. Each one is a request waterfall: prefer starting queries in loaders and
 * server components.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#use-waterfall
 */
export function useWaterfall<TDef extends ResolverDef>(
  procedure: DecorateQueryProcedure<TDef>,
  ...args: undefined extends TDef['input']
    ? [input?: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
    : [input: TDef['input'], opts?: unstable_TRPCPrefetchOptions]
): unstable_TRPCQueryHandle<TDef> {
  const [input, opts] = args;
  const queryClient = useQueryClient();
  const options = (procedure.queryOptions as any)(input, opts);
  const queryHash = hashKey(options.queryKey);

  return React.useMemo(
    () =>
      startHandle({
        queryClient,
        options,
        kind: 'query',
        verb: 'prefetch',
      }) as unstable_TRPCQueryHandle<TDef>,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new handle only when the query changes
    [queryClient, queryHash],
  );
}
