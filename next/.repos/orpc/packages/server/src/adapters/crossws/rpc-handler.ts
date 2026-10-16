import type { Context } from '../../context'
import type { Router } from '../../router'
import type { RPCHandlerCodecOptions, StandardHandlerOptions } from '../standard'
import type { experimental_CrosswsHandlerOptions as CrosswsHandlerOptions } from './handler'
import { RPCHandlerCodec, StandardHandler } from '../standard'
import { experimental_CrosswsHandler as CrosswsHandler } from './handler'

export interface experimental_RPCHandlerOptions<T extends Context>
  extends StandardHandlerOptions<T>, RPCHandlerCodecOptions<T>, CrosswsHandlerOptions<T> {}

/**
 * Serves an oRPC router over the RPC protocol on a WebSocket connection
 * managed by [crossws](https://github.com/h3js/crossws).
 *
 * @see {@link https://orpc.dev/docs/adapters/websocket | WebSocket Adapters}
 */
export class experimental_RPCHandler<T extends Context> extends CrosswsHandler<T> {
  constructor(
    router: Router<T>,
    options: NoInfer<experimental_RPCHandlerOptions<T>> = {},
  ) {
    const codec = new RPCHandlerCodec(router, options)
    const handler = new StandardHandler(codec, options)
    super(handler, options)
  }
}
