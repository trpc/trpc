import {
  CreateClient,
  createReactProxyDecoration,
  createReactQueryUtilsProxy,
  CreateReactUtilsProxy,
  createRootHooks,
  CreateTRPCReactOptions,
  DecoratedProcedureRecord,
  TRPCProvider,
  TRPCUseQueries,
} from '@trpc/react-query/shared';
import { AnyRouter, ProtectedIntersection } from '@trpc/server';
import { createFlatProxy } from '@trpc/server/shared';
import { useMemo } from 'react';
import { generateCacheTag } from './shared';

export interface CreateTRPCNextReactOptions<TRouter extends AnyRouter>
  extends CreateTRPCReactOptions<TRouter> {}

export interface CreateTRPCNextBase<TRouter extends AnyRouter> {
  useContext(): CreateReactUtilsProxy<TRouter, unknown>;
  useQueries: TRPCUseQueries<TRouter>;
  Provider: TRPCProvider<TRouter, null>;
  createClient: CreateClient<TRouter>;
}

/**
 * @internal
 */
export type CreateTRPCNext<TRouter extends AnyRouter> = ProtectedIntersection<
  CreateTRPCNextBase<TRouter>,
  DecoratedProcedureRecord<TRouter['_def']['record'], null>
>;

export function experimental_createTRPCNextReactQuery<
  TRouter extends AnyRouter,
>(opts?: CreateTRPCNextReactOptions<TRouter>): CreateTRPCNext<TRouter> {
  const hooks = createRootHooks<TRouter>(opts);

  return createFlatProxy((key) => {
    if (key === 'useContext') {
      return () => {
        const context = hooks.useContext();
        // create a stable reference of the utils context
        return useMemo(() => {
          return createReactQueryUtilsProxy(context, {
            invalidate: async (args) => {
              const cacheTag = generateCacheTag(
                args.path.join('.'),
                args.input,
              );

              await fetch('/api/trpc/revalidate', {
                method: 'POST',
                cache: 'no-store',
                body: JSON.stringify({ cacheTag }),
              });
            },
          });
        }, [context]);
      };
    }

    if (hooks.hasOwnProperty(key)) {
      return (hooks as any)[key];
    }

    if (key === 'useQueries') {
      return hooks.useQueries;
    }

    return createReactProxyDecoration(key, hooks);
  });
}
