import { WsClient } from './wsClient';
import type { WebSocketClientOptions } from './wsClient/options';

export function createWSClient(opts: WebSocketClientOptions) {
  return new WsClient(opts);
}

export type TRPCWebSocketClient = ReturnType<typeof createWSClient>;

export { WebSocketClientOptions };
