import { type CreateReactQueryHooks, createReactQueryHooks } from '@trpc/react';
import {
  DecoratedProcedureRecord,
  DecoratedProcedureUtilsRecord,
  createReactProxyDecoration,
} from '@trpc/react/shared';
import { createReactQueryUtilsProxy } from '@trpc/react/shared';
import { AnyRouter } from '@trpc/server';
import { NextPageContext } from 'next/types';
import { useMemo } from 'react';
import { WithTRPCNoSSROptions, WithTRPCSSROptions, withTRPC } from './withTRPC';

export function setupTRPC<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext = NextPageContext,
>(opts: WithTRPCNoSSROptions<TRouter> | WithTRPCSSROptions<TRouter>) {
  const hooks = createReactQueryHooks<TRouter, TSSRContext>();

  //type SSRContext = typeof opts.ssr extends true ? TSSRContext : never;
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
              return createReactQueryUtilsProxy(context as any);
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
    useContext(): DecoratedProcedureUtilsRecord<TRouter>;
    withTRPC: typeof _withTRPC;
  } & DecoratedProcedureRecord<TRouter['_def']['record']>;
}
