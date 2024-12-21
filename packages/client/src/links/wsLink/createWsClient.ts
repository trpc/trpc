import type { WebSocketClientOptions } from './wsClient/options';
import { WsClient } from './wsClient/wsClient';

export function createWSClient(opts: WebSocketClientOptions) {
  return new WsClient(opts);
}

export type TRPCWebSocketClient = ReturnType<typeof createWSClient>;

export { WebSocketClientOptions };
