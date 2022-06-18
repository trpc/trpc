import { routerToServerAndClientNew } from '../___testHelpers';
import { TRPCWebSocketClient, WebSocketClientOptions } from '@trpc/client/src';
import { CreateTRPCClientOptions } from '@trpc/client/src';
import { CreateHTTPHandlerOptions } from '../../src/adapters/standalone';
import { WSSHandlerOptions } from '../../src/adapters/ws';
import { MigrateOldRouter } from '../../src/deprecated/interop';
import { AnyRouter as OldRouter } from '../../src/deprecated/router';

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
