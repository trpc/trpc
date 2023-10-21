/* istanbul ignore file -- @preserve */
// We're testing this through E2E-testing
import {
  createHooksInternal,
  createReactProxyDecoration,
  createReactQueryUtilsProxy,
  CreateReactUtilsProxy,
  DecoratedProcedureRecord,
  TRPCUseQueries,
} from '@trpc/react-query/shared';
import { AnyRouter, ProtectedIntersection } from '@trpc/server';
import { createFlatProxy } from '@trpc/server/shared';
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
  useContext(): CreateReactUtilsProxy<TRouter, TSSRContext>;
  /**
   * @see https://trpc.io/docs/client/react/useUtils
   */
  useUtils(): CreateReactUtilsProxy<TRouter, TSSRContext>;
  withTRPC: ReturnType<typeof withTRPC<TRouter, TSSRContext>>;
  useQueries: TRPCUseQueries<TRouter>;
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
  DecoratedProcedureRecord<TRouter['_def']['record'], TFlags>
>;

export function createTRPCNext<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext = NextPageContext,
  TFlags = null,
>(
  opts: WithTRPCNoSSROptions<TRouter> | WithTRPCSSROptions<TRouter>,
): CreateTRPCNext<TRouter, TSSRContext, TFlags> {
  const hooks = createHooksInternal<TRouter, TSSRContext>(opts);

  // TODO: maybe set TSSRContext to `never` when using `WithTRPCNoSSROptions`
  const _withTRPC = withTRPC(opts);

  return createFlatProxy((key) => {
    if (key === 'useContext' || key === 'useUtils') {
      return () => {
        const context = hooks.useUtils();
        // create a stable reference of the utils context
        return useMemo(() => {
          return (createReactQueryUtilsProxy as any)(context);
        }, [context]);
      };
    }

    if (key === 'useQueries') {
      return hooks.useQueries;
    }

    if (key === 'withTRPC') {
      return _withTRPC;
    }

    return createReactProxyDecoration(key, hooks);
  });
}
