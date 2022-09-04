// interop:
import { AnyRouter } from '@trpc/server';
import { CreateTRPCReact, createHooksInternalProxy } from './createTRPCReact';
import {
  CreateReactQueryHooks,
  createHooksInternal,
} from './internals/createHooksInternal';

/**
 * @deprecated use `createTRPCReact` instead
 */
export function createReactQueryHooks<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>(): CreateReactQueryHooks<TRouter, TSSRContext> & {
  proxy: CreateTRPCReact<TRouter, TSSRContext>;
} {
  const trpc = createHooksInternal<TRouter, TSSRContext>();
  const proxy = createHooksInternalProxy<TRouter, TSSRContext>(trpc);

  return {
    ...trpc,
    proxy,
  };
}
