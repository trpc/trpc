import type { WebSocketClientOptions } from './wsClient/options';
import type { Serializer } from './wsClient/serializer';
import { jsonSerializer } from './wsClient/serializer';
import { WsClient } from './wsClient/wsClient';

export function createWSClient(opts: WebSocketClientOptions) {
  return new WsClient(opts);
}

export type TRPCWebSocketClient = ReturnType<typeof createWSClient>;

export { jsonSerializer, type Serializer, type WebSocketClientOptions };
