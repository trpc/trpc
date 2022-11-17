import {
  DehydrateOptions,
  DehydratedState,
  InfiniteData,
  dehydrate,
} from '@tanstack/react-query';
import {
  AnyRouter,
  ClientDataTransformerOptions,
  callProcedure,
  inferHandlerInput,
  inferProcedureOutput,
  inferRouterContext,
} from '@trpc/server';
import { getArrayQueryKey } from '../internals/getArrayQueryKey';
import { CreateTRPCReactQueryClientConfig, getQueryClient } from '../shared';

interface CreateSSGHelpersOptionsBase<TRouter extends AnyRouter> {
  router: TRouter;
  ctx: inferRouterContext<TRouter>;
  transformer?: ClientDataTransformerOptions;
}
export type CreateSSGHelpersOptions<TRouter extends AnyRouter> =
  CreateSSGHelpersOptionsBase<TRouter> & CreateTRPCReactQueryClientConfig;

/**
 * Create functions you can use for server-side rendering / static generation
 * @deprecated use `createProxySSGHelpers` instead
 */
export function createSSGHelpers<TRouter extends AnyRouter>(
  opts: CreateSSGHelpersOptions<TRouter>,
) {
  const { router, transformer, ctx } = opts;
  type TQueries = TRouter['_def']['queries'];
  const queryClient = getQueryClient(opts);

  const serialize = transformer
    ? ('input' in transformer ? transformer.input : transformer).serialize
    : (obj: unknown) => obj;

  const prefetchQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ) => {
    return queryClient.prefetchQuery(
      getArrayQueryKey(pathAndInput, 'query'),
      () => {
        return callProcedure({
          procedures: router._def.procedures,
          path: pathAndInput[0],
          rawInput: pathAndInput[1],
          ctx,
          type: 'query',
        });
      },
    );
  };

  const prefetchInfiniteQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ) => {
    return queryClient.prefetchInfiniteQuery(
      getArrayQueryKey(pathAndInput, 'infinite'),
      () => {
        return callProcedure({
          procedures: router._def.procedures,
          path: pathAndInput[0],
          rawInput: pathAndInput[1],
          ctx,
          type: 'query',
        });
      },
    );
  };

  const fetchQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ): Promise<TOutput> => {
    return queryClient.fetchQuery(
      getArrayQueryKey(pathAndInput, 'query'),
      () => {
        return callProcedure({
          procedures: router._def.procedures,
          path: pathAndInput[0],
          rawInput: pathAndInput[1],
          ctx,
          type: 'query',
        });
      },
    );
  };

  const fetchInfiniteQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ): Promise<InfiniteData<TOutput>> => {
    return queryClient.fetchInfiniteQuery(
      getArrayQueryKey(pathAndInput, 'infinite'),
      () => {
        return callProcedure({
          procedures: router._def.procedures,
          path: pathAndInput[0],
          rawInput: pathAndInput[1],
          ctx,
          type: 'query',
        });
      },
    );
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
