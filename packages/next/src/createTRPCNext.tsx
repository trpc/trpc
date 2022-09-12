import {
  DecoratedProcedureRecord,
  DecoratedProcedureUtilsRecord,
  createHooksInternal,
  createReactProxyDecoration,
  createReactQueryUtilsProxy,
} from '@trpc/react/shared';
import { AnyRouter } from '@trpc/server';
import { NextPageContext } from 'next/types';
import { useMemo } from 'react';
import {
  WithTRPCConfig,
  WithTRPCNoSSROptions,
  WithTRPCSSROptions,
  withTRPC,
} from './withTRPC';

export function createTRPCNext<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext = NextPageContext,
  TResult extends WithTRPCConfig<TRouter> = WithTRPCConfig<TRouter>,
>(
  opts:
    | WithTRPCNoSSROptions<TRouter, TResult>
    | WithTRPCSSROptions<TRouter, TResult>,
) {
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
    useContext(): DecoratedProcedureUtilsRecord<TRouter>;
    withTRPC: typeof _withTRPC;
  } & DecoratedProcedureRecord<TRouter['_def']['record']>;
}
