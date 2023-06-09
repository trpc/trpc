import {
  dehydrate,
  DehydratedState,
  DehydrateOptions,
  InfiniteData,
} from '@tanstack/react-query';
import {
  AnyRouter,
  callProcedure,
  inferHandlerInput,
  inferProcedureOutput,
} from '@trpc/server';
import { getArrayQueryKey } from '../internals/getArrayQueryKey';
import { CreateSSGExternalHelpersOptions, CreateSSGInternalHelpersOptions } from '../server/types';
import { getQueryClient } from '../shared';

/**
 * Create functions you can use for server-side rendering / static generation
 * @deprecated use `createServerSideHelpers` instead
 */
export function createSSGHelpers<TRouter extends AnyRouter>(
  opts: CreateSSGInternalHelpersOptions<TRouter> | CreateSSGExternalHelpersOptions<TRouter>,
) {
  type TQueries = TRouter['_def']['queries'];
  const queryClient = getQueryClient(opts);

  const serialize =
    'transformer' in opts && opts.transformer
      ? ('input' in opts.transformer
          ? opts.transformer.input
          : opts.transformer
        ).serialize
      : (obj: unknown) => obj;

  const prefetchQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ) => {
    return queryClient.prefetchQuery({
      queryKey: getArrayQueryKey(pathAndInput, 'query'),
      queryFn: () => {
        if ('router' in opts) {
          const { router, ctx } = opts;

          return callProcedure({
            procedures: router._def.procedures,
            path: pathAndInput[0],
            rawInput: pathAndInput[1],
            ctx,
            type: 'query',
          });
        }

        const { client } = opts;
        return client.query(...pathAndInput);
      },
    });
  };

  const prefetchInfiniteQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ) => {
    return queryClient.prefetchInfiniteQuery({
      queryKey: getArrayQueryKey(pathAndInput, 'infinite'),
      queryFn: () => {
        if ('router' in opts) {
          const { router, ctx } = opts;

          return callProcedure({
            procedures: router._def.procedures,
            path: pathAndInput[0],
            rawInput: pathAndInput[1],
            ctx,
            type: 'query',
          });
        }

        const { client } = opts;
        return client.query(...pathAndInput);
      },
    });
  };

  const fetchQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ): Promise<TOutput> => {
    return queryClient.fetchQuery({
      queryKey: getArrayQueryKey(pathAndInput, 'query'),
      queryFn: async () => {
        if ('router' in opts) {
          const { router, ctx } = opts;

          return callProcedure({
            procedures: router._def.procedures,
            path: pathAndInput[0],
            rawInput: pathAndInput[1],
            ctx,
            type: 'query',
          });
        }

        const { client } = opts;
        return client.query(...pathAndInput);
      },
    });
  };

  const fetchInfiniteQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ): Promise<InfiniteData<TOutput>> => {
    return queryClient.fetchInfiniteQuery({
      queryKey: getArrayQueryKey(pathAndInput, 'infinite'),
      queryFn: () => {
        if ('router' in opts) {
          const { router, ctx } = opts;

          return callProcedure({
            procedures: router._def.procedures,
            path: pathAndInput[0],
            rawInput: pathAndInput[1],
            ctx,
            type: 'query',
          });
        }

        const { client } = opts;
        return client.query(...pathAndInput);
      },
    });
  };

  function _dehydrate(
    opts: DehydrateOptions = {
      shouldDehydrateQuery() {
        // makes sure to serialize errors
        return true;
      },
    },
  ): DehydratedState {
    const before = dehydrate(queryClient, opts);
    const after = serialize(before);
    return after;
  }

  return {
    prefetchQuery,
    prefetchInfiniteQuery,
    fetchQuery,
    fetchInfiniteQuery,
    dehydrate: _dehydrate,
    queryClient,
  };
}
