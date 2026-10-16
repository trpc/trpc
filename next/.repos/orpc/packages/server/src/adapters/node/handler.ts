import type { MaybeOptionalOptions } from '@orpc/shared'
import type { NodeHttpRequest, NodeHttpResponse, SendStandardResponseOptions } from '@standard-server/node'
import type { Context } from '../../context'
import type { FriendlyStandardHandlerHandleOptions, StandardHandler } from '../standard'
import { resolveMaybeOptionalOptions } from '@orpc/shared'
import { sendStandardResponse, toStandardLazyRequest } from '@standard-server/node'
import { resolveFriendlyStandardHandlerHandleOptions } from '../standard'

export type NodeHttpHandlerHandleResult = { matched: true } | { matched: false }

export interface NodeHttpHandlerOptions<_T extends Context> {
  /**
   * Custom options for `sendStandardResponse`, used to send a `Standard Response`
   */
  sendStandardResponse?: SendStandardResponseOptions | undefined
}

export class NodeHttpHandler<T extends Context> {
  private readonly sendStandardResponseOptions: NodeHttpHandlerOptions<T>['sendStandardResponse']

  constructor(
    private readonly standardHandler: StandardHandler<T>,
    options: NoInfer<NodeHttpHandlerOptions<T>> = {},
  ) {
    this.sendStandardResponseOptions = options.sendStandardResponse
  }

  async handle(
    request: NodeHttpRequest,
    response: NodeHttpResponse,
    ...rest: MaybeOptionalOptions<FriendlyStandardHandlerHandleOptions<T>>
  ): Promise<NodeHttpHandlerHandleResult> {
    const standardRequest = toStandardLazyRequest(request, response)

    const result = await this.standardHandler.handle(
      standardRequest,
      resolveFriendlyStandardHandlerHandleOptions(resolveMaybeOptionalOptions(rest)),
    )

    if (!result.matched) {
      return result
    }

    await sendStandardResponse(response, result.response, this.sendStandardResponseOptions)

    return result
  }
}
