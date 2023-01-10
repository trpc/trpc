import {
  DehydrateOptions,
  DehydratedState,
  InfiniteData,
  QueryClient,
  dehydrate,
} from '@tanstack/react-query';
import {
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  ClientDataTransformerOptions,
  Filter,
  ProtectedIntersection,
  callProcedure,
  inferHandlerInput,
  inferRouterContext,
} from '@trpc/server';
import {
  createFlatProxy,
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import { getArrayQueryKey } from '../internals/getArrayQueryKey';
import { getQueryKey } from '../internals/getQueryKey';
import { CreateTRPCReactQueryClientConfig, getQueryClient } from '../shared';

interface CreateSSGHelpersOptionsBase<TRouter extends AnyRouter> {
  router: TRouter;
  ctx: inferRouterContext<TRouter>;
  transformer?: ClientDataTransformerOptions;
}
export type CreateSSGHelpersOptions<TRouter extends AnyRouter> =
  CreateSSGHelpersOptionsBase<TRouter> & CreateTRPCReactQueryClientConfig;

type DecorateProcedure<TProcedure extends AnyProcedure> = {
  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  fetch(
    ...args: inferHandlerInput<TProcedure>
  ): Promise<inferTransformedProcedureOutput<TProcedure>>;

  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  fetchInfinite(
    ...args: inferHandlerInput<TProcedure>
  ): Promise<InfiniteData<inferTransformedProcedureOutput<TProcedure>>>;

  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  prefetch(...args: inferHandlerInput<TProcedure>): Promise<void>;

  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  prefetchInfinite(...args: inferHandlerInput<TProcedure>): Promise<void>;
};

/**
 * @internal
 */
export type DecoratedProcedureSSGRecord<TRouter extends AnyRouter> = {
  [TKey in keyof Filter<
    TRouter['_def']['record'],
    AnyRouter | AnyQueryProcedure
  >]: TRouter['_def']['record'][TKey] extends AnyRouter
    ? DecoratedProcedureSSGRecord<TRouter['_def']['record'][TKey]>
    : // utils only apply to queries
      DecorateProcedure<TRouter['_def']['record'][TKey]>;
};

type AnyDecoratedProcedure = DecorateProcedure<any>;

/**
 * Create functions you can use for server-side rendering / static generation
 */
export function createSSGHelpers<TRouter extends AnyRouter>(
  opts: CreateSSGHelpersOptions<TRouter>,
) {
  const { router, transformer, ctx } = opts;
  const queryClient = getQueryClient(opts);

  const serialize = transformer
    ? ('input' in transformer ? transformer.input : transformer).serialize
    : (obj: unknown) => obj;

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
      const pathCopy = [key, ...opts.path];
      const utilName = pathCopy.pop() as keyof AnyDecoratedProcedure;
      const fullPath = pathCopy.join('.');

      const queryFn = () =>
        callProcedure({
          procedures: router._def.procedures,
          path: fullPath,
          rawInput: input,
          ctx,
          type: 'query',
        });

      // TODO: Come back when we have sorted out all the querykey stuff
      const queryKey = getArrayQueryKey(
        getQueryKey(fullPath, input),
        ['fetchInfinite', 'prefetchInfinite'].includes(utilName)
          ? 'infinite'
          : 'query',
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
