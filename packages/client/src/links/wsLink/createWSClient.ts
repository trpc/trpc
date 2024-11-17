import type { WebSocketClientOptions } from './wsClient';
import { WsClient } from './wsClient';

export function createWSClient(opts: WebSocketClientOptions) {
  return new WsClient(opts);
}

export type TRPCWebSocketClient = ReturnType<typeof createWSClient>;

export { WebSocketClientOptions };
