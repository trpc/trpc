// interop:
import { AnyRouter } from '@trpc/server';
import { createHooksInternalProxy, CreateTRPCReact } from './createTRPCReact';
import { CreateTRPCReactOptions } from './shared';
import {
  createHooksInternal,
  CreateReactQueryHooks,
} from './shared/hooks/createRootHooks';

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
