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

/**
 * Works like TypeScript's `Omit`, but allows safe usage of the omitted keys.
 * If you use a key that does not exist on the type, there will be a type error.
 */
type OmitStrict<TType, TKey extends keyof TType> = TType extends unknown
  ? Pick<TType, Exclude<keyof TType, TKey>>
  : never;

interface CreateSSGHelpersOptionsBase<TRouter extends AnyRouter, TContext> {
  router: TRouter;
  ctx: inferRouterContext<TRouter> extends TContext // Checking the `extend` this way makes sure that the given context is either a direct match or a subset of the router's context.
    ? TContext
    : // Helpful message shown to the user if his given context is not matching/a subset.
      "The context you have given is either not a direct match or not a subset of the router's context.";
  transformer?: ClientDataTransformerOptions;
}
export type CreateSSGHelpersOptions<
  TRouter extends AnyRouter,
  TContext,
> = CreateSSGHelpersOptionsBase<TRouter, TContext> &
  CreateTRPCReactQueryClientConfig;

/**
 * Create functions you can use for server-side rendering / static generation
 * @deprecated use `createProxySSGHelpers` instead
 */
export function createSSGHelpers<TRouter extends AnyRouter, TContext>(
  // Omit the context so we can infer its given type.
  opts: OmitStrict<CreateSSGHelpersOptions<TRouter, TContext>, 'ctx'> & {
    ctx: TContext;
  },
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
