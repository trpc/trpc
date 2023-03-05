import { CreateTRPCClientOptions, createTRPCProxyClient } from '@trpc/client';
import { AnyRouter } from '@trpc/server';

type CreateTRPCNextAppRouterReactServerOptions<TRouter extends AnyRouter> = {
  config: () => CreateTRPCClientOptions<TRouter>;
};

export function createTRPCNextAppRouter<TRouter extends AnyRouter>(
  opts: CreateTRPCNextAppRouterReactServerOptions<TRouter>,
) {
  const client = createTRPCProxyClient<TRouter>(opts.config());

  return client;
}
