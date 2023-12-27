import {
  dehydrate,
  DehydratedState,
  DehydrateOptions,
  InfiniteData,
  QueryClient,
} from '@tanstack/react-query';
import {
  getUntypedClient,
  inferRouterClient,
  TRPCClientError,
  TRPCUntypedClient,
} from '@trpc/client';
import {
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootConfig,
  AnyRouter,
  callProcedure,
  DataTransformerOptions,
  inferProcedureInput,
  inferRouterContext,
} from '@trpc/server';
import {
  createFlatProxy,
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import {
  Filter,
  Maybe,
  ProtectedIntersection,
} from '@trpc/server/unstableInternalsExport';
import { getQueryKeyInternal } from '../internals/getQueryKey';
import {
  CreateTRPCReactQueryClientConfig,
  ExtractCursorType,
  getQueryClient,
  getQueryType,
  TRPCFetchInfiniteQueryOptions,
  TRPCFetchQueryOptions,
} from '../shared';

interface CreateSSGHelpersInternal<TRouter extends AnyRouter> {
  router: TRouter;
  ctx: inferRouterContext<TRouter>;
  transformer?: DataTransformerOptions;
}

interface CreateSSGHelpersExternal<TRouter extends AnyRouter> {
  client: inferRouterClient<TRouter> | TRPCUntypedClient<TRouter>;
}

type CreateServerSideHelpersOptions<TRouter extends AnyRouter> =
  CreateTRPCReactQueryClientConfig &
    (CreateSSGHelpersExternal<TRouter> | CreateSSGHelpersInternal<TRouter>);

type DecorateProcedure<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> = {
  /**
   * @link https://tanstack.com/query/v5/docs/react/guides/prefetching
   */
  fetch(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchQueryOptions<
      inferTransformedProcedureOutput<TConfig, TProcedure>,
      TRPCClientError<TConfig>
    >,
  ): Promise<inferTransformedProcedureOutput<TConfig, TProcedure>>;

  /**
   * @link https://tanstack.com/query/v5/docs/react/guides/prefetching
   */
  fetchInfinite(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchInfiniteQueryOptions<
      inferProcedureInput<TProcedure>,
      inferTransformedProcedureOutput<TConfig, TProcedure>,
      TRPCClientError<TConfig>
    >,
  ): Promise<
    InfiniteData<
      inferTransformedProcedureOutput<TConfig, TProcedure>,
      NonNullable<ExtractCursorType<inferProcedureInput<TProcedure>>> | null
    >
  >;

  /**
   * @link https://tanstack.com/query/v5/docs/react/guides/prefetching
   */
  prefetch(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchQueryOptions<
      inferTransformedProcedureOutput<TConfig, TProcedure>,
      TRPCClientError<TConfig>
    >,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v5/docs/react/guides/prefetching
   */
  prefetchInfinite(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchInfiniteQueryOptions<
      inferProcedureInput<TProcedure>,
      inferTransformedProcedureOutput<TConfig, TProcedure>,
      TRPCClientError<TConfig>
    >,
  ): Promise<void>;
};

/**
 * @internal
 */
type DecoratedProcedureSSGRecord<TRouter extends AnyRouter> = {
  [TKey in keyof Filter<
    TRouter['_def']['record'],
    AnyQueryProcedure | AnyRouter
  >]: TRouter['_def']['record'][TKey] extends AnyRouter
    ? DecoratedProcedureSSGRecord<TRouter['_def']['record'][TKey]>
    : // utils only apply to queries
      DecorateProcedure<
        TRouter['_def']['_config'],
        TRouter['_def']['record'][TKey]
      >;
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
            getRawInput: async () => queryOpts.input,
            ctx,
            type: 'query',
          });
        },
      };
    }

    const { client } = opts;
    const untypedClient =
      client instanceof TRPCUntypedClient ? client : getUntypedClient(client);

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
        fetch: () => {
          const args1 = args[1] as Maybe<TRPCFetchQueryOptions<any, any>>;
          return queryClient.fetchQuery({ ...args1, queryKey, queryFn });
        },
        fetchInfinite: () => {
          const args1 = args[1] as Maybe<
            TRPCFetchInfiniteQueryOptions<any, any, any>
          >;
          return queryClient.fetchInfiniteQuery({
            ...args1,
            queryKey,
            queryFn,
            initialPageParam: args1?.initialCursor ?? null,
          });
        },
        prefetch: () => {
          const args1 = args[1] as Maybe<TRPCFetchQueryOptions<any, any>>;
          return queryClient.prefetchQuery({ ...args1, queryKey, queryFn });
        },
        prefetchInfinite: () => {
          const args1 = args[1] as Maybe<
            TRPCFetchInfiniteQueryOptions<any, any, any>
          >;
          return queryClient.prefetchInfiniteQuery({
            ...args1,
            queryKey,
            queryFn,
            initialPageParam: args1?.initialCursor ?? null,
          });
        },
      };

      return helperMap[utilName]();
    });
  });
}
