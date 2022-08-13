import { InfiniteData } from '@tanstack/react-query';
import {
  AnyRouter,
  OmitNeverKeys,
  Procedure,
  QueryProcedure,
  inferHandlerInput,
  inferProcedureOutput,
} from '@trpc/server';
import { createProxy } from '@trpc/server/shared';
import {
  CreateSSGHelpers,
  CreateSSGHelpersOptions,
  createSSGHelpers,
} from './ssg';

type DecorateProcedure<TProcedure extends Procedure<any>> = {
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
export type DecoratedProcedureSSGRecord<TRouter extends AnyRouter> =
  OmitNeverKeys<{
    [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends AnyRouter
      ? DecoratedProcedureSSGRecord<TRouter['_def']['record'][TKey]>
      : // utils only apply to queries
      TRouter['_def']['record'][TKey] extends QueryProcedure<any>
      ? DecorateProcedure<TRouter['_def']['record'][TKey]>
      : never;
  }>;

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

  return proxy as Pick<CreateSSGHelpers, 'queryClient' | 'dehydrate'> &
    DecoratedProcedureSSGRecord<TRouter>;
}
