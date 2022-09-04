// interop:
import { AnyRouter } from '@trpc/server';
import { createHooksInternalProxy } from './createTRPCReact';
import { createHooksInternal } from './internals/createHooksInternal';

/**
 * @deprecated use `createTRPCReact` instead
 */
export function createReactQueryHooks<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>() {
  const trpc = createHooksInternal<TRouter, TSSRContext>();
  const proxy = createHooksInternalProxy<TRouter, TSSRContext>(trpc);

  return {
    ...trpc,
    proxy,
  };
}
