import type {
  inferRouterProxyClient,
  TRPCClient,
  TRPCUntypedClient,
} from '@trpc/client';
import type {
  AnyRouter,
  ClientDataTransformerOptions,
  inferRouterContext,
} from '@trpc/server';
import type { CreateTRPCReactQueryClientConfig } from '../shared';

interface CreateSSGHelpersInternal<TRouter extends AnyRouter> {
  router: TRouter;
  ctx: inferRouterContext<TRouter>;
  transformer?: ClientDataTransformerOptions;
}

interface CreateSSGHelpersExternal<TRouter extends AnyRouter> {
  client:
    | inferRouterProxyClient<TRouter>
    | TRPCUntypedClient<TRouter>
    // FIXME: @deprecated
    | TRPCClient<TRouter>;
}

export type CreateServerSideHelpersOptions<TRouter extends AnyRouter> =
  CreateTRPCReactQueryClientConfig &
    (CreateSSGHelpersExternal<TRouter> | CreateSSGHelpersInternal<TRouter>);
