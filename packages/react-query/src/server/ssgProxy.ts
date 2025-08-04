import type {
  DehydratedState,
  DehydrateOptions,
  QueryClient,
} from '@tanstack/react-query';
import { dehydrate } from '@tanstack/react-query';
import type { TRPCClient } from '@trpc/client';
import { getUntypedClient, TRPCUntypedClient } from '@trpc/client';
import type { CoercedTransformerParameters } from '@trpc/client/unstable-internals';
import {
  getTransformer,
  type TransformerOptions,
} from '@trpc/client/unstable-internals';
import type {
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  inferClientTypes,
  inferRouterContext,
  Maybe,
  ProtectedIntersection,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import {
  callProcedure,
  createFlatProxy,
  createRecursiveProxy,
  run,
} from '@trpc/server/unstable-core-do-not-import';
import { getQueryKeyInternal } from '../internals/getQueryKey';
import type {
  CreateTRPCReactQueryClientConfig,
  DecorateQueryProcedure,
  TRPCFetchInfiniteQueryOptions,
  TRPCFetchQueryOptions,
} from '../shared';
import { getQueryClient, getQueryType } from '../shared';

type CreateSSGHelpersInternal<TRouter extends AnyRouter> = {
  router: TRouter;
  ctx: inferRouterContext<TRouter>;
} & TransformerOptions<inferClientTypes<TRouter>>;

interface CreateSSGHelpersExternal<TRouter extends AnyRouter> {
  client: TRPCClient<TRouter> | TRPCUntypedClient<TRouter>;
}

type CreateServerSideHelpersOptions<TRouter extends AnyRouter> =
  CreateTRPCReactQueryClientConfig &
    (CreateSSGHelpersExternal<TRouter> | CreateSSGHelpersInternal<TRouter>);

type SSGFns =
  | 'queryOptions'
  | 'infiniteQueryOptions'
  | 'fetch'
  | 'fetchInfinite'
  | 'prefetch'
  | 'prefetchInfinite';

/**
 * @internal
 */
type DecoratedProcedureSSGRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends AnyQueryProcedure
      ? Pick<DecorateQueryProcedure<TRoot, $Value>, SSGFns>
      : $Value extends RouterRecord
        ? DecoratedProcedureSSGRecord<TRoot, $Value>
        : never
    : never;
};

type AnyDecoratedProcedure = Pick<DecorateQueryProcedure<any, any>, SSGFns>;

/**
 * Create functions you can use for server-side rendering / static generation
 * @see https://trpc.io/docs/v11/client/nextjs/server-side-helpers
 */
export function createServerSideHelpers<TRouter extends AnyRouter>(
  opts: CreateServerSideHelpersOptions<TRouter>,
) {
  const queryClient = getQueryClient(opts);
  const transformer = getTransformer(
    (opts as CoercedTransformerParameters).transformer,
  );

  const resolvedOpts: {
    serialize: (obj: unknown) => any;
    query: (queryOpts: { path: string; input: unknown }) => Promise<unknown>;
  } = (() => {
    if ('router' in opts) {
      const { ctx, router } = opts;
      return {
        serialize: (obj) => transformer.output.serialize(obj),
        query: (queryOpts) => {
          return callProcedure({
            router,
            path: queryOpts.path,
            getRawInput: async () => queryOpts.input,
            ctx,
            type: 'query',
            signal: undefined,
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
      serialize: (obj) => transformer.output.serialize(obj),
    };
  })();

  function _dehydrate(
    opts: DehydrateOptions = {
      shouldDehydrateQuery(query) {
        if (query.state.status === 'pending') {
          return false;
        }
        // makes sure to serialize errors
        return true;
      },
    },
  ): DehydratedState {
    const before = run(() => {
      const dehydrated = dehydrate(queryClient, opts);

      return {
        ...dehydrated,
        queries: dehydrated.queries.map((query) => {
          if (query.promise) {
            const { promise: _, ...rest } = query;
            return rest;
          }
          return query;
        }),
      };
    });
    const after = resolvedOpts.serialize(before);
    return after;
  }

  type CreateSSGHelpers = ProtectedIntersection<
    {
      queryClient: QueryClient;
      dehydrate: (opts?: DehydrateOptions) => DehydratedState;
    },
    DecoratedProcedureSSGRecord<
      TRouter['_def']['_config']['$types'],
      TRouter['_def']['record']
    >
  >;
  const proxy = createRecursiveProxy<CreateSSGHelpers>((opts) => {
    const args = opts.args;
    const input = args[0];
    const arrayPath = [...opts.path];
    const utilName = arrayPath.pop() as keyof AnyDecoratedProcedure;

    const queryFn = () =>
      resolvedOpts.query({ path: arrayPath.join('.'), input });

    const queryKey = getQueryKeyInternal(
      arrayPath,
      input,
      getQueryType(utilName),
    );

    const helperMap: Record<keyof AnyDecoratedProcedure, () => unknown> = {
      queryOptions: () => {
        const args1 = args[1] as Maybe<any>;
        return { ...args1, queryKey, queryFn };
      },
      infiniteQueryOptions: () => {
        const args1 = args[1] as Maybe<any>;
        return { ...args1, queryKey, queryFn };
      },
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
  return createFlatProxy<CreateSSGHelpers>((key) => {
    if (key === 'queryClient') return queryClient;
    if (key === 'dehydrate') return _dehydrate;
    return proxy[key];
  });
}
