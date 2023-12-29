/* istanbul ignore file -- @preserve */
// We're testing this through E2E-testing
import { AnyRouter } from '@trpc/core';
import { createFlatProxy } from '@trpc/core/shared';
import { ProtectedIntersection } from '@trpc/core/unstableInternalsExport';
import {
  createReactDecoration,
  createReactQueryUtils,
  CreateReactUtils,
  createRootHooks,
  DecoratedProcedureRecord,
  TRPCUseQueries,
  TRPCUseSuspenseQueries,
} from '@trpc/react-query/shared';
import { NextPageContext } from 'next/types';
import { useMemo } from 'react';
import { withTRPC, WithTRPCNoSSROptions, WithTRPCSSROptions } from './withTRPC';

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
   * @see https://trpc.io/docs/client/react/useUtils
   */
  useContext(): CreateReactUtils<TRouter, TSSRContext>;
  /**
   * @see https://trpc.io/docs/client/react/useUtils
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
  TFlags,
> = ProtectedIntersection<
  CreateTRPCNextBase<TRouter, TSSRContext>,
  DecoratedProcedureRecord<
    TRouter['_def']['_config'],
    TRouter['_def']['record'],
    TFlags
  >
>;

export function createTRPCNext<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext = NextPageContext,
  TFlags = null,
>(
  opts: WithTRPCNoSSROptions<TRouter> | WithTRPCSSROptions<TRouter>,
): CreateTRPCNext<TRouter, TSSRContext, TFlags> {
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
