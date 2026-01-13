import type { Encoder } from './wsClient/encoder';
import { jsonEncoder } from './wsClient/encoder';
import type { WebSocketClientOptions } from './wsClient/options';
import { WsClient } from './wsClient/wsClient';

export function createWSClient(opts: WebSocketClientOptions) {
  return new WsClient(opts);
}

export type TRPCWebSocketClient = ReturnType<typeof createWSClient>;

export { jsonEncoder, type Encoder, type WebSocketClientOptions };
