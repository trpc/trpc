import {
  DehydrateOptions,
  DehydratedState,
  InfiniteData,
  QueryClient,
} from '@tanstack/react-query';
import {
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  Filter,
  inferHandlerInput,
} from '@trpc/server';
import {
  createFlatProxy,
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import { CreateSSGHelpersOptions, createSSGHelpers } from './ssg';

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
export function createProxySSGHelpers<TRouter extends AnyRouter>(
  opts: CreateSSGHelpersOptions<TRouter>,
) {
  const helpers = createSSGHelpers(opts);

  type CreateProxySSGHelpers = {
    queryClient: QueryClient;
    dehydrate: (opts?: DehydrateOptions) => DehydratedState;
  } & DecoratedProcedureSSGRecord<TRouter>;

  return createFlatProxy<CreateProxySSGHelpers>((key) => {
    if (key === 'queryClient') {
      return helpers.queryClient;
    }

    if (key === 'dehydrate') {
      return helpers.dehydrate;
    }
    return createRecursiveProxy((opts) => {
      const args = opts.args;

      const pathCopy = [key, ...opts.path];

      const utilName = pathCopy.pop() as keyof AnyDecoratedProcedure;

      const fullPath = pathCopy.join('.');

      switch (utilName) {
        case 'fetch': {
          return helpers.fetchQuery(fullPath, ...(args as any));
        }
        case 'fetchInfinite': {
          return helpers.fetchInfiniteQuery(fullPath, ...(args as any));
        }
        case 'prefetch': {
          return helpers.prefetchQuery(fullPath, ...(args as any));
        }
        case 'prefetchInfinite': {
          return helpers.prefetchInfiniteQuery(fullPath, ...(args as any));
        }
      }
    });
  });
}
