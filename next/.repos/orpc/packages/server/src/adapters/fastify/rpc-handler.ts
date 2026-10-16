import type { Context } from '../../context'
import type { Router } from '../../router'
import type { RPCHandlerCodecOptions, StandardHandlerOptions } from '../standard'
import type { FastifyHandlerOptions } from './handler'
import { RPCHandlerCodec, StandardHandler } from '../standard'
import { FastifyHandler } from './handler'

export interface RPCHandlerOptions<T extends Context>
  extends FastifyHandlerOptions<T>, StandardHandlerOptions<T>, RPCHandlerCodecOptions<T> {}

/**
 * Serves an oRPC router over the RPC protocol inside a Fastify server.
 *
 * @see {@link https://orpc.dev/docs/adapters/fastify | Fastify Adapter}
 */
export class RPCHandler<T extends Context> extends FastifyHandler<T> {
  constructor(
    router: Router<T>,
    options: NoInfer<RPCHandlerOptions<T>> = {},
  ) {
    const codec = new RPCHandlerCodec(router, options)
    const handler = new StandardHandler(codec, options)
    super(handler, options)
  }
}
