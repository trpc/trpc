import type { Context, Router } from '@orpc/server'
import type { FetchHandlerOptions } from '@orpc/server/fetch'
import type { StandardHandlerOptions } from '@orpc/server/standard'
import type { OpenAPIHandlerCodecOptions } from '../standard'
import { FetchHandler } from '@orpc/server/fetch'
import { StandardHandler } from '@orpc/server/standard'
import { OpenAPIHandlerCodec } from '../standard'

export interface OpenAPIHandlerOptions<T extends Context>
  extends FetchHandlerOptions<T>, StandardHandlerOptions<T>, OpenAPIHandlerCodecOptions<T> {}

/**
 * Serves oRPC procedures over the OpenAPI (RESTful) protocol using the Fetch API `Request`/`Response`.
 *
 * @see {@link https://orpc.dev/docs/adapters/fetch-api | Fetch API Adapter}
 */
export class OpenAPIHandler<T extends Context> extends FetchHandler<T> {
  constructor(
    router: Router<T>,
    options: NoInfer<OpenAPIHandlerOptions<T>> = {},
  ) {
    const codec = new OpenAPIHandlerCodec(router, options)
    const handler = new StandardHandler(codec, options)
    super(handler, options)
  }
}
