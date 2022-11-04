import { routerToServerAndClientNew } from '../___testHelpers';
import {
  CreateTRPCClientOptions,
  TRPCWebSocketClient,
  WebSocketClientOptions,
} from '@trpc/client/src';
import { CreateHTTPHandlerOptions } from '@trpc/server/src/adapters/standalone';
import { WSSHandlerOptions } from '@trpc/server/src/adapters/ws';
import { MigrateOldRouter } from '@trpc/server/src/deprecated/interop';
import { AnyRouter as OldRouter } from '@trpc/server/src/deprecated/router';

/**
 * @deprecated v9 router
 */

export function legacyRouterToServerAndClient<TOldRouter extends OldRouter>(
  _router: TOldRouter,
  opts?: {
    server?: Partial<CreateHTTPHandlerOptions<MigrateOldRouter<TOldRouter>>>;
    wssServer?: Partial<WSSHandlerOptions<MigrateOldRouter<TOldRouter>>>;
    wsClient?: Partial<WebSocketClientOptions>;
    client?:
      | Partial<CreateTRPCClientOptions<MigrateOldRouter<TOldRouter>>>
      | ((opts: {
          httpUrl: string;
          wssUrl: string;
          wsClient: TRPCWebSocketClient;
        }) => Partial<CreateTRPCClientOptions<MigrateOldRouter<TOldRouter>>>);
  },
) {
  const router = _router.interop() as MigrateOldRouter<TOldRouter>;
  return routerToServerAndClientNew(router, opts);
}
