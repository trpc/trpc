/* istanbul ignore file -- @preserve */
// We're testing this through E2E-testing
import type {
  CreateReactUtils,
  DecorateRouterRecord,
  TRPCUseQueries,
  TRPCUseSuspenseQueries,
} from '@trpc/react-query/shared';
import {
  createReactDecoration,
  createReactQueryUtils,
  createRootHooks,
} from '@trpc/react-query/shared';
import type {
  AnyRouter,
  ProtectedIntersection,
} from '@trpc/server/unstable-core-do-not-import';
import { createFlatProxy } from '@trpc/server/unstable-core-do-not-import';
import type { NextPageContext } from 'next/types';
import { useMemo } from 'react';
import type { WithTRPCNoSSROptions, WithTRPCSSROptions } from './withTRPC';
import { withTRPC } from './withTRPC';

/**
 * @internal
 */
export interface CreateTRPCNextBase<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext,
> {
  /**
   * @deprecated renamed to `useUtils` and will be removed in a future tRPC version
   *
   * @link https://trpc.io/docs/v11/client/react/useUtils
   */
  useContext(): CreateReactUtils<TRouter, TSSRContext>;
  /**
   * @link https://trpc.io/docs/v11/client/react/useUtils
   */
  useUtils(): CreateReactUtils<TRouter, TSSRContext>;
  withTRPC: ReturnType<typeof withTRPC<TRouter, TSSRContext>>;
  useQueries: TRPCUseQueries<TRouter>;
  useSuspenseQueries: TRPCUseSuspenseQueries<TRouter>;
}

/**
 * @internal
 */
export type CreateTRPCNext<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext,
> = ProtectedIntersection<
  CreateTRPCNextBase<TRouter, TSSRContext>,
  DecorateRouterRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
  >
>;

export function createTRPCNext<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext = NextPageContext,
>(
  opts: WithTRPCNoSSROptions<TRouter> | WithTRPCSSROptions<TRouter>,
): CreateTRPCNext<TRouter, TSSRContext> {
  const hooks = createRootHooks<TRouter, TSSRContext>(opts);

  // TODO: maybe set TSSRContext to `never` when using `WithTRPCNoSSROptions`
  const _withTRPC = withTRPC(opts);

  return createFlatProxy((key) => {
    if (key === 'useContext' || key === 'useUtils') {
      return () => {
        const context = hooks.useUtils();
        // create a stable reference of the utils context
        return useMemo(() => {
          return (createReactQueryUtils as any)(context);
        }, [context]);
      };
    }

    if (key === 'useQueries') {
      return hooks.useQueries;
    }

    if (key === 'useSuspenseQueries') {
      return hooks.useSuspenseQueries;
    }

    if (key === 'withTRPC') {
      return _withTRPC;
    }

    return createReactDecoration(key, hooks);
  });
}
