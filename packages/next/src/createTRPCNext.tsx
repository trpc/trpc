import {
  CreateReactUtilsProxy,
  DecoratedProcedureRecord,
  createHooksInternal,
  createReactProxyDecoration,
  createReactQueryUtilsProxy,
} from '@trpc/react/shared';
import { AnyRouter } from '@trpc/server';
import { NextPageContext } from 'next/types';
import { useMemo } from 'react';
import { WithTRPCNoSSROptions, WithTRPCSSROptions, withTRPC } from './withTRPC';

export function createTRPCNext<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext = NextPageContext,
>(opts: WithTRPCNoSSROptions<TRouter> | WithTRPCSSROptions<TRouter>) {
  const hooks = createHooksInternal<TRouter, TSSRContext>();

  // TODO: maybe set TSSRContext to `never` when using `WithTRPCNoSSROptions`
  const _withTRPC = withTRPC<TRouter, TSSRContext>(opts);

  const proxy: unknown = new Proxy(
    () => {
      // no-op
    },
    {
      get(_obj, name) {
        if (name === 'useContext') {
          return () => {
            const context = hooks.useContext();
            // create a stable reference of the utils context
            return useMemo(() => {
              return (createReactQueryUtilsProxy as any)(context);
            }, [context]);
          };
        }

        if (name === 'withTRPC') {
          return _withTRPC;
        }

        if (typeof name === 'string') {
          return createReactProxyDecoration(name, hooks);
        }

        throw new Error('Not supported');
      },
    },
  );

  return proxy as {
    useContext(): CreateReactUtilsProxy<TRouter, TSSRContext>;
    withTRPC: typeof _withTRPC;
  } & DecoratedProcedureRecord<TRouter['_def']['record']>;
}
