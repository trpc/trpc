import type { MaybeOptionalOptions } from '@orpc/shared'
import type { AnyAPIGatewayProxyEvent, HttpResponseStream, SendStandardResponseOptions } from '@standard-server/aws-lambda'
import type { Context } from '../../context'
import type { FriendlyStandardHandlerHandleOptions, StandardHandler } from '../standard'
import { resolveMaybeOptionalOptions } from '@orpc/shared'
import { sendStandardResponse, toStandardLazyRequest } from '@standard-server/aws-lambda'
import { resolveFriendlyStandardHandlerHandleOptions } from '../standard'

export type AwsLambdaHandlerHandleResult = { matched: true } | { matched: false }

export interface AwsLambdaHandlerOptions<_T extends Context> {
  /**
   * Custom options for `sendStandardResponse`, used to send a `Standard Response`
   */
  sendStandardResponse?: SendStandardResponseOptions | undefined
}

/**
 * Requires the AWS Lambda Node.js runtime with response streaming enabled,
 * handlers should be wrapped with `awslambda.streamifyResponse`.
 */
export class AwsLambdaHandler<T extends Context> {
  private readonly sendStandardResponseOptions: AwsLambdaHandlerOptions<T>['sendStandardResponse']

  constructor(
    private readonly standardHandler: StandardHandler<T>,
    options: NoInfer<AwsLambdaHandlerOptions<T>> = {},
  ) {
    this.sendStandardResponseOptions = options.sendStandardResponse
  }

  async handle(
    event: AnyAPIGatewayProxyEvent,
    responseStream: HttpResponseStream,
    ...rest: MaybeOptionalOptions<FriendlyStandardHandlerHandleOptions<T>>
  ): Promise<AwsLambdaHandlerHandleResult> {
    const standardRequest = toStandardLazyRequest(event, responseStream)

    const result = await this.standardHandler.handle(
      standardRequest,
      resolveFriendlyStandardHandlerHandleOptions(resolveMaybeOptionalOptions(rest)),
    )

    if (!result.matched) {
      return result
    }

    await sendStandardResponse(responseStream, result.response, this.sendStandardResponseOptions)

    return result
  }
}
