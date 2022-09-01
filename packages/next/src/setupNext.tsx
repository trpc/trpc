import { createReactQueryHooks } from '@trpc/react';
import type {
  DecoratedProcedureRecord,
  DecoratedProcedureUtilsRecord,
} from '@trpc/react/shared';
import { createReactQueryUtilsProxy } from '@trpc/react/shared';
import { AnyRouter } from '@trpc/server';
import { createProxy } from '@trpc/server/shared';
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
        switch (name) {
          case 'useUtilsContext':
            // FIXME: Code duplication from `createReactQueryHooksProxy`
            return () => {
              const context = hooks.useContext();
              // create a stable reference of the utils context
              return useMemo(() => {
                return createReactQueryUtilsProxy(context as any);
              }, [context]);
            };
          // We can't just do a generic hooks[name] since we don't (or atleast didn't export all hooks)
          // Maybe ['useContext', ...].includes(name) would work and decrease the big switch
          case 'useContext':
            return hooks.useContext;
          case 'useInfiniteQuery':
            return hooks.useInfiniteQuery;
          case 'useMutation':
            return hooks.useMutation;
          case 'useQuery':
            return hooks.useQuery;
          case 'useSubscription':
            return hooks.useSubscription;

          case 'withTRPC':
            return _withTRPC;

          default:
            if (typeof name !== 'string') {
              throw new Error('Invalid name');
            }
            return createProxy((opts) => {
              // FIXME: Code duplication from `createReactQueryHooksProxy`
              const args = opts.args;

              const pathCopy = [name, ...opts.path];

              // The last arg is for instance `.useMutation` or `.useQuery()`
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              const lastArg = pathCopy.pop()!;

              // The `path` ends up being something like `post.byId`
              const path = pathCopy.join('.');
              if (lastArg === 'useMutation') {
                return (hooks as any)[lastArg](path, ...args);
              }
              const [input, ...rest] = args;

              const queryKey = input === undefined ? [path] : [path, input];

              return (hooks as any)[lastArg](queryKey, ...rest);
            });
        }
      },
    },
  );

  // FIXME: Look into using `CreateReactQueryHooks` here?
  // We are not returning the full object I don't think
  return proxy as {
    useUtilsContext(): DecoratedProcedureUtilsRecord<TRouter>;
    useContext(): typeof hooks.useContext;
    useInfiniteQuery: typeof hooks.useInfiniteQuery;
    useMutation: typeof hooks.useMutation;
    useQuery: typeof hooks.useQuery;
    useSubscription: typeof hooks.useSubscription;
    withTRPC: typeof _withTRPC;
    queries: typeof hooks.queries;
  } & DecoratedProcedureRecord<TRouter['_def']['record']>;

  /*return {
    ...proxy,
    useProxyContext: proxyHooks.useContext,
    useContext: hooks.useContext,
    useInfiniteQuery: hooks.useInfiniteQuery,
    useMutation: hooks.useMutation,
    useQuery: hooks.useQuery,
    useSubscription: hooks.useSubscription,
    withTRPC: _withTRPC,
    queries: hooks.queries,
  };*/
}
