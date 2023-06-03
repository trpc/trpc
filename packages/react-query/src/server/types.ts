import { TRPCUntypedClient } from '@trpc/client';
import {
  AnyRouter,
  ClientDataTransformerOptions,
  inferRouterContext,
} from '@trpc/server';
import { CreateTRPCReactQueryClientConfig } from '../shared';

interface CreateRouterSSGHelpersOptionsBase<TRouter extends AnyRouter> {
  type: 'router';
  router: TRouter;
  ctx: inferRouterContext<TRouter>;
  transformer?: ClientDataTransformerOptions;
}

interface CreateClientSSGHelpersOptionsBase<TRouter extends AnyRouter> {
  type: 'client';
  client: TRPCUntypedClient<TRouter>;
  transformer?: ClientDataTransformerOptions;
}

export type CreateSSGHelpersOptions<TRouter extends AnyRouter> = (
  | CreateRouterSSGHelpersOptionsBase<TRouter>
  | CreateClientSSGHelpersOptionsBase<TRouter>
) &
  CreateTRPCReactQueryClientConfig;
