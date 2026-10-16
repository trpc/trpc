import type { Context } from '../../context'
import type { Router } from '../../router'
import type { RPCHandlerCodecOptions, StandardHandlerOptions } from '../standard'
import type { FetchHandlerOptions } from './handler'
import { RPCHandlerCodec, StandardHandler } from '../standard'
import { FetchHandler } from './handler'

export interface RPCHandlerOptions<T extends Context>
  extends FetchHandlerOptions<T>, StandardHandlerOptions<T>, RPCHandlerCodecOptions<T> {}

/**
 * Serves an oRPC router over the RPC protocol using the Fetch API
 * (Request/Response), supported by modern runtimes like Deno, Bun,
 * Cloudflare Workers, and browsers.
 *
 * @see {@link https://orpc.dev/docs/adapters/fetch-api | Fetch API Adapter}
 */
export class RPCHandler<T extends Context> extends FetchHandler<T> {
  constructor(
    router: Router<T>,
    options: NoInfer<RPCHandlerOptions<T>> = {},
  ) {
    const codec = new RPCHandlerCodec(router, options)
    const handler = new StandardHandler(codec, options)
    super(handler, options)
  }
}
