import type { MaybeOptionalOptions } from '@orpc/shared'
import type { ToFetchResponseOptions } from '@standard-server/fetch'
import type { Context } from '../../context'
import type { FriendlyStandardHandlerHandleOptions, StandardHandler } from '../standard'
import { resolveMaybeOptionalOptions } from '@orpc/shared'
import { toFetchResponse, toStandardLazyRequest } from '@standard-server/fetch'
import { resolveFriendlyStandardHandlerHandleOptions } from '../standard'

export type FetchHandlerHandleResult = { matched: true, response: Response } | { matched: false, response?: undefined }

export interface FetchHandlerOptions<_T extends Context> {
  /**
   * Options for how to convert the Fetch Response to a Standard Response, like event stream options, etc.
   */
  toFetchResponse?: undefined | ToFetchResponseOptions
}

export class FetchHandler<T extends Context> {
  private readonly toFetchResponseOptions: FetchHandlerOptions<T>['toFetchResponse']

  constructor(
    private readonly standardHandler: StandardHandler<T>,
    options: NoInfer<FetchHandlerOptions<T>> = {},
  ) {
    this.toFetchResponseOptions = options.toFetchResponse
  }

  async handle(
    request: Request,
    ...rest: MaybeOptionalOptions<FriendlyStandardHandlerHandleOptions<T>>
  ): Promise<FetchHandlerHandleResult> {
    const standardRequest = toStandardLazyRequest(request)

    const result = await this.standardHandler.handle(
      standardRequest,
      resolveFriendlyStandardHandlerHandleOptions(resolveMaybeOptionalOptions(rest)),
    )

    if (!result.matched) {
      return result
    }

    return {
      matched: true,
      response: toFetchResponse(result.response, this.toFetchResponseOptions),
    }
  }
}
