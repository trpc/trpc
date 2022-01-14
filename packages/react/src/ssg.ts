import type { TRPCClientErrorLike } from '@trpc/client';
import {
  AnyRouter,
  assertNotBrowser,
  ClientDataTransformerOptions,
  inferHandlerInput,
  inferProcedureOutput,
  inferRouterContext,
  TRPCError,
} from '@trpc/server';
import { TRPCErrorShape } from '@trpc/server/rpc';
import { InfiniteData, QueryClient } from 'react-query';
import {
  dehydrate,
  DehydratedState,
  DehydrateOptions,
} from 'react-query/hydration';

assertNotBrowser();

export interface CreateSSGHelpersOptions<TRouter extends AnyRouter> {
  router: TRouter;
  ctx: inferRouterContext<TRouter>;
  transformer?: ClientDataTransformerOptions;
  queryClientConfig?: QueryClientConfig;
}

type QueryClientConfig = ConstructorParameters<typeof QueryClient>[0];

/**
 * Create functions you can use for server-side rendering / static generation
 */
export function createSSGHelpers<TRouter extends AnyRouter>({
  router,
  transformer,
  ctx,
  queryClientConfig,
}: CreateSSGHelpersOptions<TRouter>) {
  type TQueries = TRouter['_def']['queries'];
  const queryClient = new QueryClient(queryClientConfig);

  function dehydrateQueryCacheErrors<
    TState extends DehydratedState['queries'][0],
  >(result: TState): TState {
    const err = result.state.error;
    if (!(err instanceof Error && err.name === 'TRPCError')) {
      return result;
    }

    const error = err as TRPCError;
    // transform to TRPCClientError

    // try to get the path and input from the queryKey
    const [path, input] = Array.isArray(result.queryKey)
      ? result.queryKey
      : [null, null];
    // get error shape from router
    // TODO: maybe in a later version of tRPC a `.query()`-call automatically does this?
    const shape: TRPCErrorShape = router.getErrorShape({
      path,
      input,
      error,
      ctx,
      type: 'query',
    });
    // create `TRPCClientErrorLike` from error
    const output: TRPCClientErrorLike<TRouter> = {
      message: shape.message,
      shape: shape as any,
      data: shape.data,
    };
    return {
      ...result,
      state: {
        ...result.state,
        error: output,
      },
    };
  }
  const caller = router.createCaller(ctx) as ReturnType<
    TRouter['createCaller']
  >;
  const prefetchQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ) => {
    return queryClient.prefetchQuery(pathAndInput, async () => {
      const data = await caller.query(...pathAndInput);

      return data;
    });
  };

  const prefetchInfiniteQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ) => {
    return queryClient.prefetchInfiniteQuery(pathAndInput, async () => {
      const data = await caller.query(...pathAndInput);

      return data;
    });
  };

  const fetchQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ): Promise<TOutput> => {
    return queryClient.fetchQuery(pathAndInput, async () => {
      const data = await caller.query(...pathAndInput);

      return data;
    });
  };

  const fetchInfiniteQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
  >(
    ...pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ): Promise<InfiniteData<TOutput>> => {
    return queryClient.fetchInfiniteQuery(pathAndInput, async () => {
      const data = await caller.query(...pathAndInput);

      return data;
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
    const serialize = transformer
      ? ('input' in transformer ? transformer.input : transformer).serialize
      : (obj: unknown) => obj;
    const dehydrated = dehydrate(queryClient, opts);

    // transform errors
    dehydrated.queries = dehydrated.queries.map((result) =>
      dehydrateQueryCacheErrors(result),
    );

    return serialize(dehydrated);
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
