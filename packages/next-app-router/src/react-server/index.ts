import { CreateTRPCProxyClient, createTRPCProxyClient } from '@trpc/client';
import { ssrLink } from '@trpc/client/links/ssrLink';
import { AnyRouter, inferRouterContext } from '@trpc/server';

type CreateTRPCNextAppRouterReactServerOptions<TRouter extends AnyRouter> = {
  router: TRouter;
  createContext: () => Promise<inferRouterContext<TRouter>>;
};

export async function createTRPCNextAppRouter<TRouter extends AnyRouter>(
  opts: CreateTRPCNextAppRouterReactServerOptions<TRouter>,
) {
  const client = createTRPCProxyClient({
    links: [
      ssrLink<AnyRouter>({
        router: opts.router,
        createContext: opts.createContext,
      }),
    ],
  }) as CreateTRPCProxyClient<TRouter>;

  return client;
}
