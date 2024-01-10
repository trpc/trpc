import type {
  DehydratedState,
  DehydrateOptions,
  InfiniteData,
  QueryClient,
} from '@tanstack/react-query';
import type {
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  Filter,
  inferHandlerInput,
  ProtectedIntersection,
} from '@trpc/server';
import type { inferTransformedProcedureOutput } from '@trpc/server/shared';
import { createFlatProxy, createRecursiveProxy } from '@trpc/server/shared';
import { createSSGHelpers } from '../ssg/ssg';
import type { CreateServerSideHelpersOptions } from './types';

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
    AnyQueryProcedure | AnyRouter
  >]: TRouter['_def']['record'][TKey] extends AnyRouter
    ? DecoratedProcedureSSGRecord<TRouter['_def']['record'][TKey]>
    : // utils only apply to queries
      DecorateProcedure<TRouter['_def']['record'][TKey]>;
};

type AnyDecoratedProcedure = DecorateProcedure<any>;

/**
 * Create functions you can use for server-side rendering / static generation
 * @see https://trpc.io/docs/client/nextjs/server-side-helpers
 */
export function createServerSideHelpers<TRouter extends AnyRouter>(
  opts: CreateServerSideHelpersOptions<TRouter>,
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

      const helperKey = `${utilName}Query` as const;
      //     ^?

      const fn: (...args: any) => any = helpers[helperKey];
      return fn(fullPath, ...args);
    });
  });
}
