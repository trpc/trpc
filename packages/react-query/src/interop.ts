// interop:
import { AnyRouter } from '@trpc/server';
import { CreateTRPCReact, createHooksInternalProxy } from './createTRPCReact';
import { CreateTRPCReactOptions } from './shared';
import {
  CreateReactQueryHooks,
  createHooksInternal,
} from './shared/hooks/createHooksInternal';

/**
 * @deprecated use `createTRPCReact` instead
 */
export function createReactQueryHooks<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
  TFlags = null,
>(
  opts?: CreateTRPCReactOptions<TRouter>,
): CreateReactQueryHooks<TRouter, TSSRContext> & {
  proxy: CreateTRPCReact<TRouter, TSSRContext, TFlags>;
} {
  const trpc = createHooksInternal<TRouter, TSSRContext>(opts);
  const proxy = createHooksInternalProxy<TRouter, TSSRContext, TFlags>(trpc);

  return {
    ...trpc,
    proxy,
  };
}
