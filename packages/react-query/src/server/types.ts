import { TRPCUntypedClient } from '@trpc/client';
import {
  AnyRouter,
  ClientDataTransformerOptions,
  inferRouterContext,
} from '@trpc/server';
import { CreateTRPCReactQueryClientConfig } from '../shared';

interface CreateSSGInternalHelpersOptionsBase<TRouter extends AnyRouter> {
  router: TRouter;
  ctx: inferRouterContext<TRouter>;
  transformer?: ClientDataTransformerOptions;
}

interface CreateSSGExternalHelpersOptionsBase<TRouter extends AnyRouter> {
  client: TRPCUntypedClient<TRouter>;
  transformer?: ClientDataTransformerOptions;
}

export type CreateSSGInternalHelpersOptions<TRouter extends AnyRouter> = CreateSSGInternalHelpersOptionsBase<TRouter> & CreateTRPCReactQueryClientConfig;
export type CreateSSGExternalHelpersOptions<TRouter extends AnyRouter> = CreateSSGExternalHelpersOptionsBase<TRouter> & CreateTRPCReactQueryClientConfig;
