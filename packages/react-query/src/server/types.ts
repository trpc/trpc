import {
  AnyRouter,
  ClientDataTransformerOptions,
  inferRouterContext,
} from '@trpc/server';
import { CreateTRPCReactQueryClientConfig } from '../shared';

interface CreateSSGHelpersOptionsBase<TRouter extends AnyRouter> {
  router: TRouter;
  ctx: inferRouterContext<TRouter>;
  transformer?: ClientDataTransformerOptions;
}
export type CreateSSGHelpersOptions<TRouter extends AnyRouter> =
  CreateSSGHelpersOptionsBase<TRouter> & CreateTRPCReactQueryClientConfig;
