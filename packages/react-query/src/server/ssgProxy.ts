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
  ProtectedIntersection,
  inferHandlerInput,
} from '@trpc/server';
import {
  createFlatProxy,
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import { createSSGHelpers } from '../ssg/ssg';
import { CreateSSGHelpersOptions } from './types';

type DecorateProcedure<TProcedure extends AnyProcedure> = {
  /**
   * @link https://tanstack.com/query/v4/docs/react/guides/prefetching
   */
  fetch(
    ...args: inferHandlerInput<TProcedure>
  ): Promise<inferTransformedProcedureOutput<TProcedure>>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/guides/prefetching
   */
  fetchInfinite(
    ...args: inferHandlerInput<TProcedure>
  ): Promise<InfiniteData<inferTransformedProcedureOutput<TProcedure>>>;

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
export function createServerSideHelpers<TRouter extends AnyRouter>(
  opts: CreateSSGHelpersOptions<TRouter>,
) {
  const helpers = createSSGHelpers(opts);

  type CreateServerSideHelpers = ProtectedIntersection<
    {
      queryClient: QueryClient;
      dehydrate: (opts?: DehydrateOptions) => DehydratedState;
    },
    DecoratedProcedureSSGRecord<TRouter>
  >;

  return createFlatProxy<CreateServerSideHelpers>((key) => {
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
