import { routerToServerAndClientNew } from '../___testHelpers';
import type {
  TRPCWebSocketClient,
  WebSocketClientOptions,
} from '@trpc/client/src';
import type { WithTRPCConfig } from '@trpc/next';
import type { CreateHTTPHandlerOptions } from '@trpc/server/src/adapters/standalone';
import type { WSSHandlerOptions } from '@trpc/server/src/adapters/ws';
import type { MigrateOldRouter } from '@trpc/server/src/deprecated/interop';
import type { AnyRouter as OldRouter } from '@trpc/server/src/deprecated/router';

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
      | Partial<WithTRPCConfig<MigrateOldRouter<TOldRouter>>>
      | ((opts: {
          httpUrl: string;
          wssUrl: string;
          wsClient: TRPCWebSocketClient;
        }) => Partial<WithTRPCConfig<MigrateOldRouter<TOldRouter>>>);
  },
) {
  const router = _router.interop() as MigrateOldRouter<TOldRouter>;
  return routerToServerAndClientNew(router, opts);
}
