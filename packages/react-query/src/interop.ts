// interop:
import type { AnyRouter } from '@trpc/server';
import type { CreateTRPCReact } from './createTRPCReact';
import { createHooksInternalProxy } from './createTRPCReact';
import type { CreateTRPCReactOptions } from './shared';
import type { CreateReactQueryHooks } from './shared/hooks/createRootHooks';
import { createHooksInternal } from './shared/hooks/createRootHooks';

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
