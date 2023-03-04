import {
  CreateTRPCClientOptions,
  CreateTRPCProxyClient,
  createTRPCProxyClient,
} from '@trpc/client';
import { AnyRouter } from '@trpc/server';

type CreateTRPCNextAppRouterClientOptions<TRouter extends AnyRouter> = {
  config: () => CreateTRPCClientOptions<TRouter>;
};

export function createTRPCNextAppRouter<TRouter extends AnyRouter>(
  opts: CreateTRPCNextAppRouterClientOptions<TRouter>,
) {
  const clientOptions = opts.config();

  const client: CreateTRPCProxyClient<TRouter> =
    createTRPCProxyClient(clientOptions);

  return client;
}
