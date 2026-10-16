import type { AnyORPCError } from '@orpc/client'
import type { Promisable, Public, Value } from '@orpc/shared'
import type { StandardLazyRequest, StandardResponse } from '@standard-server/core'
import type { Context } from '../../context'
import type { AnyProcedure } from '../../procedure'
import type { AnyRouter } from '../../router'
import type { ResolvedStandardHandlerHandleOptions, StandardHandlerCodec, StandardHandlerCodecResolvedProcedure } from '../standard'
import type { RPCMatcherOptions } from './rpc-matcher'
import { COMMON_ERROR_STATUS_MAP, RPCSerializer } from '@orpc/client'
import { getOwn, parseEmptyableJSON, value } from '@orpc/shared'
import { parseStandardUrl } from '@standard-server/core'
import { DEFAULT_ERROR_STATUS, DEFAULT_SUCCESS_STATUS } from '../../constants'
import { RPCMatcher } from './rpc-matcher'

export interface RPCHandlerCodecOptions<T extends Context> extends RPCMatcherOptions {
  /**
   * Override the default RPC serializer.
   */
  serializer?: Public<RPCSerializer>

  /**
   * Resolve HTTP status for encoded successful outputs.
   *
   * Value should be in the `2xx` range and must be less than `400`.
   * Return `undefined` or `null` to fallback to default
   *
   * @default DEFAULT_SUCCESS_STATUS (200)
   */
  outputStatus?: Value<number | undefined | null, [output: unknown, procedure: AnyProcedure, path: string[], options: ResolvedStandardHandlerHandleOptions<T>]>

  /**
   * Mapping ORPCError Code -> HTTP Status Code
   * The status code should be in the `4xx` or `5xx` range (must be greater than or equal to `400`).
   *
   * @default COMMON_ERROR_STATUS_MAP
   */
  errorStatusMap?: Record<string, number> | undefined
}

export class RPCHandlerCodec<T extends Context> implements StandardHandlerCodec<T> {
  private readonly matcher: RPCMatcher
  private readonly serializer: Public<RPCSerializer>
  private readonly errorStatusMap: Exclude<RPCHandlerCodecOptions<T>['errorStatusMap'], undefined>
  private readonly outputStatus: RPCHandlerCodecOptions<T>['outputStatus']

  constructor(router: AnyRouter, options: RPCHandlerCodecOptions<T> = {}) {
    this.matcher = new RPCMatcher(router, options)
    this.serializer = options.serializer ?? new RPCSerializer()
    this.errorStatusMap = options.errorStatusMap ?? COMMON_ERROR_STATUS_MAP
    this.outputStatus = options.outputStatus
  }

  async resolveProcedure(request: StandardLazyRequest, options: ResolvedStandardHandlerHandleOptions<T>): Promise<StandardHandlerCodecResolvedProcedure | undefined> {
    const [pathname, query] = parseStandardUrl(request.url)

    const matched = await this.matcher.match(request.method, pathname, options.prefix)
    if (!matched) {
      return undefined
    }

    return {
      procedure: matched.procedure,
      path: matched.path,
      decodeInput: async () => {
        if (request.method === 'GET') {
          const dataString = (new URLSearchParams(query)).getAll('data').at(-1)
          return this.serializer.deserialize(parseEmptyableJSON(dataString))
        }

        const body = await request.resolveBody()
        return this.serializer.deserialize(body)
      },
    }
  }

  encodeOutput(output: unknown, procedure: AnyProcedure, path: string[], options: ResolvedStandardHandlerHandleOptions<T>): Promisable<StandardResponse> {
    return {
      headers: {},
      status: value(this.outputStatus, output, procedure, path, options) ?? DEFAULT_SUCCESS_STATUS,
      body: this.serializer.serialize(output),
    }
  }

  encodeError(error: AnyORPCError, _procedure: AnyProcedure, _path: string[], _options: ResolvedStandardHandlerHandleOptions<T>): Promisable<StandardResponse> {
    const status = getOwn(this.errorStatusMap, error.code) ?? DEFAULT_ERROR_STATUS

    return {
      headers: {},
      status,
      body: this.serializer.serialize(error.toJSON()),
    }
  }
}
