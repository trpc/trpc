/* istanbul ignore file -- @preserve */
// We're testing this through E2E-testing
import {
  CreateReactUtilsProxy,
  DecoratedProcedureRecord,
  TRPCUseQueries,
  createHooksInternal,
  createReactProxyDecoration,
  createReactQueryUtilsProxy,
} from '@trpc/react-query/shared';
import { AnyRouter, ProtectedIntersection } from '@trpc/server';
import { createFlatProxy } from '@trpc/server/shared';
import { NextPageContext } from 'next/types';
import { useMemo } from 'react';
import { WithTRPCNoSSROptions, WithTRPCSSROptions, withTRPC } from './withTRPC';

/**
 * @internal
 */
export interface CreateTRPCNextBase<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext,
> {
  useContext(): CreateReactUtilsProxy<TRouter, TSSRContext>;
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
  const hooks = createHooksInternal<TRouter, TSSRContext>({
    unstable_overrides: opts.unstable_overrides,
  });

  // TODO: maybe set TSSRContext to `never` when using `WithTRPCNoSSROptions`
  const _withTRPC = withTRPC(opts);

  return createFlatProxy((key) => {
    if (key === 'useContext') {
      return () => {
        const context = hooks.useContext();
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
