import type { Context } from '../../context'
import type { Router } from '../../router'
import type { RPCHandlerCodecOptions, StandardHandlerOptions } from '../standard'
import type { WebSocketHandlerOptions } from './handler'
import { RPCHandlerCodec, StandardHandler } from '../standard'
import { WebSocketHandler } from './handler'

export interface RPCHandlerOptions<T extends Context>
  extends StandardHandlerOptions<T>, RPCHandlerCodecOptions<T>, WebSocketHandlerOptions<T> {}

/**
 * Serves an oRPC router over the RPC protocol on a standard WebSocket
 * connection (Deno, Bun, Cloudflare Durable Objects, and more).
 *
 * @see {@link https://orpc.dev/docs/adapters/websocket | WebSocket Adapters}
 */
export class RPCHandler<T extends Context> extends WebSocketHandler<T> {
  constructor(
    router: Router<T>,
    options: NoInfer<RPCHandlerOptions<T>> = {},
  ) {
    const codec = new RPCHandlerCodec(router, options)
    const handler = new StandardHandler(codec, options)
    super(handler, options)
  }
}
