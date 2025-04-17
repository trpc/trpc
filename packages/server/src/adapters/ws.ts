import type ws from 'ws';
import type { AnyRouter } from '../@trpc/server';
// eslint-disable-next-line no-restricted-imports
import {
  newWsHandler,
  type WsClient,
  type WSHandlerOptions,
} from '../unstable-core-do-not-import/websockets';
import { incomingMessageToRequestWithoutBody } from './node-http';

export type WSSHandlerOptions<TRouter extends AnyRouter> =
  WSHandlerOptions<TRouter> & {
    wss: ws.WebSocketServer;
  };

export function applyWSSHandler<TRouter extends AnyRouter>(
  opts: WSSHandlerOptions<TRouter>,
) {
  const handler = newWsHandler(opts);

  opts.wss.on('connection', (client, req) => {
    if (opts.prefix && !req.url?.startsWith(opts.prefix)) {
      return;
    }

    const fetchReq = incomingMessageToRequestWithoutBody(req);
    const wsClient = client satisfies WsClient;

    const connection = handler.newConnection(fetchReq, wsClient);

    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    client.on('message', (data) => connection.onMessage(data.toString()));
    client.on('error', (cause) => connection.onError(cause));
    client.on('close', (code) => connection.onClose(code));
  });
  return {
    broadcastReconnectNotification: () =>
      handler.broadcastReconnectNotification(),
  };
}
