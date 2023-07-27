import {
  dehydrate,
  DehydratedState,
  DehydrateOptions,
  InfiniteData,
  QueryClient,
} from '@tanstack/react-query';
import {
  getUntypedClient,
  inferRouterProxyClient,
  TRPCUntypedClient,
} from '@trpc/client';
import {
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  callProcedure,
  ClientDataTransformerOptions,
  inferHandlerInput,
  inferRouterContext,
  ProtectedIntersection,
} from '@trpc/server';
import {
  createFlatProxy,
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import { getQueryKeyInternal } from '../internals/getQueryKey';
import {
  CreateTRPCReactQueryClientConfig,
  getQueryClient,
  getQueryType,
} from '../shared';

interface CreateSSGHelpersInternal<TRouter extends AnyRouter> {
  router: TRouter;
  ctx: inferRouterContext<TRouter>;
  transformer?: ClientDataTransformerOptions;
}

interface CreateSSGHelpersExternal<TRouter extends AnyRouter> {
  client: inferRouterProxyClient<TRouter> | TRPCUntypedClient<TRouter>;
}

type CreateServerSideHelpersOptions<TRouter extends AnyRouter> =
  CreateTRPCReactQueryClientConfig &
    (CreateSSGHelpersExternal<TRouter> | CreateSSGHelpersInternal<TRouter>);

type DecorateProcedure<
  TRouter extends AnyRouter,
  TProcedure extends AnyProcedure,
> = {
  /**
   * @link https://tanstack.com/query/v4/docs/react/guides/prefetching
   */
  fetch(
    ...args: inferHandlerInput<TProcedure>
  ): Promise<inferTransformedProcedureOutput<TRouter, TProcedure>>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/guides/prefetching
   */
  fetchInfinite(
    ...args: inferHandlerInput<TProcedure>
  ): Promise<
    InfiniteData<inferTransformedProcedureOutput<TRouter, TProcedure>>
  >;

  /**
   * @link https://tanstack.com/query/v4/docs/react/guides/prefetching
   */
  prefetch(...args: inferHandlerInput<TProcedure>): Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/guides/prefetching
   */
  prefetchInfinite(...args: inferHandlerInput<TProcedure>): Promise<void>;
};

/**
 * @internal
 */
type DecoratedProcedureSSGRecord<TRouter extends AnyRouter> = {
  [TKey in keyof TRouter['_def']['record'] as TRouter[TKey] extends
    | AnyQueryProcedure
    | AnyRouter
    ? TKey
    : never]: TRouter['_def']['record'][TKey] extends AnyRouter
    ? DecoratedProcedureSSGRecord<TRouter['_def']['record'][TKey]>
    : // utils only apply to queries
      DecorateProcedure<TRouter, TRouter['_def']['record'][TKey]>;
};

type AnyDecoratedProcedure = DecorateProcedure<any, any>;

/**
 * Create functions you can use for server-side rendering / static generation
 * @see https://trpc.io/docs/client/nextjs/server-side-helpers
 */
export function createServerSideHelpers<TRouter extends AnyRouter>(
  opts: CreateServerSideHelpersOptions<TRouter>,
) {
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

  type CreateSSGHelpers = ProtectedIntersection<
    {
      queryClient: QueryClient;
      dehydrate: (opts?: DehydrateOptions) => DehydratedState;
    },
    DecoratedProcedureSSGRecord<TRouter>
  >;

  return createFlatProxy<CreateSSGHelpers>((key) => {
    if (key === 'queryClient') return queryClient;
    if (key === 'dehydrate') return _dehydrate;

    return createRecursiveProxy((opts) => {
      const args = opts.args;
      const input = args[0];
      const arrayPath = [key, ...opts.path];
      const utilName = arrayPath.pop() as keyof AnyDecoratedProcedure;

      const queryFn = () =>
        resolvedOpts.query({ path: arrayPath.join('.'), input });

      const queryKey = getQueryKeyInternal(
        arrayPath,
        input,
        getQueryType(utilName),
      );

      const helperMap: Record<keyof AnyDecoratedProcedure, () => unknown> = {
        fetch: () => queryClient.fetchQuery({ queryKey, queryFn }),
        fetchInfinite: () =>
          queryClient.fetchInfiniteQuery({ queryKey, queryFn }),
        prefetch: () => queryClient.prefetchQuery({ queryKey, queryFn }),
        prefetchInfinite: () =>
          queryClient.prefetchInfiniteQuery({ queryKey, queryFn }),
      };

      return helperMap[utilName]();
    });
  });
}
