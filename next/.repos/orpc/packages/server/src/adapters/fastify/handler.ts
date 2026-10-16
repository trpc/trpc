import type { MaybeOptionalOptions } from '@orpc/shared'
import type { AnyFastifyReply, AnyFastifyRequest, SendStandardResponseOptions } from '@standard-server/fastify'
import type { Context } from '../../context'
import type { FriendlyStandardHandlerHandleOptions, StandardHandler } from '../standard'
import { resolveMaybeOptionalOptions } from '@orpc/shared'
import { sendStandardResponse, toStandardLazyRequest } from '@standard-server/fastify'
import { resolveFriendlyStandardHandlerHandleOptions } from '../standard'

export type FastifyHandlerHandleResult = { matched: true } | { matched: false }

export interface FastifyHandlerOptions<_T extends Context> {
  /**
   * Custom options for `sendStandardResponse`, used to send a `Standard Response`
   */
  sendStandardResponse?: SendStandardResponseOptions | undefined
}

export class FastifyHandler<T extends Context> {
  private readonly sendStandardResponseOptions: FastifyHandlerOptions<T>['sendStandardResponse']

  constructor(
    private readonly standardHandler: StandardHandler<T>,
    options: NoInfer<FastifyHandlerOptions<T>> = {},
  ) {
    this.sendStandardResponseOptions = options.sendStandardResponse
  }

  async handle(
    request: AnyFastifyRequest,
    reply: AnyFastifyReply,
    ...rest: MaybeOptionalOptions<FriendlyStandardHandlerHandleOptions<T>>
  ): Promise<FastifyHandlerHandleResult> {
    const standardRequest = toStandardLazyRequest(request, reply)

    const result = await this.standardHandler.handle(
      standardRequest,
      resolveFriendlyStandardHandlerHandleOptions(resolveMaybeOptionalOptions(rest)),
    )

    if (!result.matched) {
      return result
    }

    await sendStandardResponse(reply, result.response, this.sendStandardResponseOptions)

    return result
  }
}
