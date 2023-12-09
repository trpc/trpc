import { QueryClient } from '@tanstack/react-query';
import { TRPCClient } from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { getArrayQueryKey } from '../internals/getArrayQueryKey';
import { getClientArgs } from '../internals/getClientArgs';
import { createQueryClientUtilsProxy } from '../shared';

/**
 * Create a query client utility functions
 *
 * DO NOT USE THIS IN REACT COMPONENTS, use `useUtils()` instead
 * @param queryClient The react-query client
 * @param client The TRPC client
 * @returns Query Client utility functions
 */
export function createQueryUtils<TRouter extends AnyRouter>(
  queryClient: QueryClient,
  client: TRPCClient<TRouter>,
) {
  return createQueryClientUtilsProxy<TRouter>({
    fetchQuery: (pathAndInput, opts) => {
      return queryClient.fetchQuery({
        ...opts,
        queryKey: getArrayQueryKey(pathAndInput, 'query'),
        queryFn: () =>
          (client as any).query(...getClientArgs(pathAndInput, opts)),
      });
    },
    fetchInfiniteQuery: (pathAndInput, opts) => {
      return queryClient.fetchInfiniteQuery({
        ...opts,
        queryKey: getArrayQueryKey(pathAndInput, 'infinite'),
        queryFn: ({ pageParam }) => {
          const [path, input] = pathAndInput;
          const actualInput = { ...input, cursor: pageParam };
          return (client as any).query(
            ...getClientArgs([path, actualInput], opts),
          );
        },
      });
    },
    prefetchQuery: (pathAndInput, opts) => {
      return queryClient.prefetchQuery({
        ...opts,
        queryKey: getArrayQueryKey(pathAndInput, 'query'),
        queryFn: () =>
          (client as any).query(...getClientArgs(pathAndInput, opts)),
      });
    },
    prefetchInfiniteQuery: (pathAndInput, opts) => {
      return queryClient.prefetchInfiniteQuery({
        ...opts,
        queryKey: getArrayQueryKey(pathAndInput, 'infinite'),
        queryFn: ({ pageParam }) => {
          const [path, input] = pathAndInput;
          const actualInput = { ...input, cursor: pageParam };
          return (client as any).query(
            ...getClientArgs([path, actualInput], opts),
          );
        },
      });
    },
    ensureQueryData: (pathAndInput, opts) => {
      return queryClient.ensureQueryData({
        ...opts,
        queryKey: getArrayQueryKey(pathAndInput, 'query'),
        queryFn: () =>
          (client as any).query(...getClientArgs(pathAndInput, opts)),
      });
    },
    invalidateQueries: (queryKey, filters, options) => {
      return queryClient.invalidateQueries(
        {
          ...filters,
          queryKey: getArrayQueryKey(queryKey as any, 'any'),
        },
        options,
      );
    },
    resetQueries: (...args: any[]) => {
      const [queryKey, filters, options] = args;

      return queryClient.resetQueries(
        {
          ...filters,
          queryKey: getArrayQueryKey(queryKey, 'any'),
        },
        options,
      );
    },
    refetchQueries: (...args: any[]) => {
      const [queryKey, filters, options] = args;

      return queryClient.refetchQueries(
        {
          ...filters,
          queryKey: getArrayQueryKey(queryKey, 'any'),
        },
        options,
      );
    },
    cancelQuery: (pathAndInput) => {
      return queryClient.cancelQueries({
        queryKey: getArrayQueryKey(pathAndInput, 'any'),
      });
    },
    setQueryData: (...args) => {
      const [queryKey, ...rest] = args;
      return queryClient.setQueryData(
        getArrayQueryKey(queryKey, 'query'),
        ...rest,
      );
    },
    getQueryData: (...args) => {
      const [queryKey, ...rest] = args;

      return queryClient.getQueryData(
        getArrayQueryKey(queryKey, 'query'),
        ...rest,
      );
    },
    setInfiniteQueryData: (...args) => {
      const [queryKey, ...rest] = args;

      return queryClient.setQueryData(
        getArrayQueryKey(queryKey, 'infinite'),
        ...rest,
      );
    },
    getInfiniteQueryData: (...args) => {
      const [queryKey, ...rest] = args;

      return queryClient.getQueryData(
        getArrayQueryKey(queryKey, 'infinite'),
        ...rest,
      );
    },
  });
}
