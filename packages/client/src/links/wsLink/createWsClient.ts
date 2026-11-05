import type { Encoder } from './wsClient/encoder';
import { jsonEncoder } from './wsClient/encoder';
import type { WebSocketClientOptions } from './wsClient/options';
import { createWsClientRuntime } from './wsClient/wsClient';

/**
 * Opens and manages a WebSocket connection to a tRPC server. Pass it to
 * `wsLink`.
 *
 * @see https://trpc.io/docs/client/links/wsLink#wslink--createwsclient-options
 */
export function createWSClient(opts: WebSocketClientOptions) {
  return createWsClientRuntime(opts);
}

/**
 * The client returned by {@link createWSClient}.
 */
export type TRPCWebSocketClient = ReturnType<typeof createWSClient>;

export { jsonEncoder, type Encoder, type WebSocketClientOptions };
