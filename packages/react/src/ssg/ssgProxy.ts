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
  inferProcedureOutput,
} from '@trpc/server';
import { createProxy } from '@trpc/server/shared';
import { CreateSSGHelpersOptions, createSSGHelpers } from './ssg';

type DecorateProcedure<TProcedure extends AnyProcedure> = {
  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  fetch(
    ...args: inferHandlerInput<TProcedure>
  ): Promise<inferProcedureOutput<TProcedure>>;

  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  fetchInfinite(
    ...args: inferHandlerInput<TProcedure>
  ): Promise<InfiniteData<inferProcedureOutput<TProcedure>>>;

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

  const proxy: unknown = new Proxy(
    () => {
      // noop
    },
    {
      get(_obj, name) {
        if (name === 'queryClient') {
          return helpers.queryClient;
        }

        if (name === 'dehydrate') {
          return helpers.dehydrate;
        }

        if (typeof name === 'string') {
          return createProxy((opts) => {
            const args = opts.args;

            const pathCopy = [name, ...opts.path];

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
                return helpers.prefetchInfiniteQuery(
                  fullPath,
                  ...(args as any),
                );
              }
            }
          });
        }

        throw new Error('Not supported');
      },
    },
  );

  return proxy as {
    queryClient: QueryClient;
    dehydrate: (opts?: DehydrateOptions) => DehydratedState;
  } & DecoratedProcedureSSGRecord<TRouter>;
}
