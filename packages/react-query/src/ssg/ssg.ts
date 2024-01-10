import type {
  DehydratedState,
  DehydrateOptions,
  InfiniteData,
} from '@tanstack/react-query';
import { dehydrate } from '@tanstack/react-query';
import { getUntypedClient, TRPCUntypedClient } from '@trpc/client';
import type {
  AnyRouter,
  inferHandlerInput,
  inferProcedureOutput,
} from '@trpc/server';
import { callProcedure } from '@trpc/server';
import { getArrayQueryKey } from '../internals/getArrayQueryKey';
import type { CreateServerSideHelpersOptions } from '../server/types';
import { getQueryClient } from '../shared';

/**
 * Create functions you can use for server-side rendering / static generation
 * @deprecated use `createServerSideHelpers` instead
 */
export function createSSGHelpers<TRouter extends AnyRouter>(
  opts: CreateServerSideHelpersOptions<TRouter>,
) {
  type TQueries = TRouter['_def']['queries'];
  const queryClient = getQueryClient(opts);

  const resolvedOpts: {
    serialize: (obj: unknown) => any;
    query: (queryOpts: { path: string; input: unknown }) => Promise<unknown>;
  } = (() => {
    if ('router' in opts) {
      const { transformer, ctx, router } = opts;
      return {
        serialize: transformer
          ? ('input' in transformer ? transformer.input : transformer).serialize
          : (obj) => obj,
        query: (queryOpts) => {
          return callProcedure({
            procedures: router._def.procedures,
            path: queryOpts.path,
            rawInput: queryOpts.input,
            ctx,
            type: 'query',
          });
        },
      };
    }

    const { client } = opts;
    const untypedClient =
      client instanceof TRPCUntypedClient
        ? client
        : getUntypedClient(client as any);

    return {
      query: (queryOpts) =>
        untypedClient.query(queryOpts.path, queryOpts.input),
      serialize: (obj) => untypedClient.runtime.transformer.serialize(obj),
    };
  })();

  const prefetchQuery = async <
    TPath extends string & keyof TQueries,
    TProcedure extends TQueries[TPath],
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ) => {
    return queryClient.prefetchQuery({
      queryKey: getArrayQueryKey(pathAndInput, 'query'),
      queryFn: () =>
        resolvedOpts.query({ path: pathAndInput[0], input: pathAndInput[1] }),
    });
  };

  const prefetchInfiniteQuery = async <
    TPath extends string & keyof TQueries,
    TProcedure extends TQueries[TPath],
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ) => {
    return queryClient.prefetchInfiniteQuery({
      queryKey: getArrayQueryKey(pathAndInput, 'infinite'),
      queryFn: () =>
        resolvedOpts.query({ path: pathAndInput[0], input: pathAndInput[1] }),
    });
  };

  const fetchQuery = async <
    TPath extends string & keyof TQueries,
    TProcedure extends TQueries[TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ): Promise<TOutput> => {
    return queryClient.fetchQuery({
      queryKey: getArrayQueryKey(pathAndInput, 'query'),
      queryFn: () =>
        resolvedOpts.query({ path: pathAndInput[0], input: pathAndInput[1] }),
    });
  };

  const fetchInfiniteQuery = async <
    TPath extends string & keyof TQueries,
    TProcedure extends TQueries[TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ): Promise<InfiniteData<TOutput>> => {
    return queryClient.fetchInfiniteQuery({
      queryKey: getArrayQueryKey(pathAndInput, 'infinite'),
      queryFn: () =>
        resolvedOpts.query({ path: pathAndInput[0], input: pathAndInput[1] }),
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
    const after = resolvedOpts.serialize(before);

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
