import type { Context } from '../../context'
import type { Router } from '../../router'
import type { RPCHandlerCodecOptions, StandardHandlerOptions } from '../standard'
import type { NodeHttpHandlerOptions } from './handler'
import { RPCHandlerCodec, StandardHandler } from '../standard'
import { NodeHttpHandler } from './handler'

export interface RPCHandlerOptions<T extends Context>
  extends NodeHttpHandlerOptions<T>, StandardHandlerOptions<T>, RPCHandlerCodecOptions<T> {}

/**
 * Serves an oRPC router over the RPC protocol using Node.js built-in
 * HTTP request/response objects.
 *
 * @see {@link https://orpc.dev/docs/adapters/node-http | Node HTTP Adapter}
 */
export class RPCHandler<T extends Context> extends NodeHttpHandler<T> {
  constructor(
    router: Router<T>,
    options: NoInfer<RPCHandlerOptions<T>> = {},
  ) {
    const codec = new RPCHandlerCodec(router, options)
    const handler = new StandardHandler(codec, options)
    super(handler, options)
  }
}
