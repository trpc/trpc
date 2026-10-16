import type { Context, Router } from '@orpc/server'
import type { AwsLambdaHandlerOptions } from '@orpc/server/aws-lambda'
import type { StandardHandlerOptions } from '@orpc/server/standard'
import type { OpenAPIHandlerCodecOptions } from '../standard'
import { AwsLambdaHandler } from '@orpc/server/aws-lambda'
import { StandardHandler } from '@orpc/server/standard'
import { OpenAPIHandlerCodec } from '../standard'

export interface OpenAPIHandlerOptions<T extends Context>
  extends AwsLambdaHandlerOptions<T>, StandardHandlerOptions<T>, OpenAPIHandlerCodecOptions<T> {}

/**
 * Serves oRPC procedures over the OpenAPI (RESTful) protocol on AWS Lambda.
 *
 * @remarks
 * **Warning**: Requires the AWS Lambda Node.js runtime with response streaming enabled — handlers should be wrapped with `awslambda.streamifyResponse`.
 *
 * @see {@link https://orpc.dev/docs/adapters/aws-lambda | AWS Lambda Adapter}
 */
export class OpenAPIHandler<T extends Context> extends AwsLambdaHandler<T> {
  constructor(
    router: Router<T>,
    options: NoInfer<OpenAPIHandlerOptions<T>> = {},
  ) {
    const codec = new OpenAPIHandlerCodec(router, options)
    const handler = new StandardHandler(codec, options)
    super(handler, options)
  }
}
