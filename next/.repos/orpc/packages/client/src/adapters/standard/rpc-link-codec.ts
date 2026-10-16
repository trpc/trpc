import type { Promisable, Public, Value } from '@orpc/shared'
import type { StandardHeaders, StandardLazyResponse, StandardRequest, StandardUrl } from '@standard-server/core'
import type { ClientContext, ClientOptions } from '../../types'
import type { StandardLinkCodec, StandardLinkCodecDecodedResponse } from '../standard'
import { isAsyncIteratorObject, pathToHttpPath, stringifyJSON, value } from '@orpc/shared'
import { mergeStandardHeaders, parseStandardUrl } from '@standard-server/core'
import { toStandardHeaders } from '@standard-server/fetch'
import { MalformedResponseError } from '../../error'
import { createORPCErrorFromJson, isORPCErrorJson } from '../../error-utils'
import { RPCSerializer } from '../../rpc-serializer'

export interface RPCLinkCodecOptions<T extends ClientContext> {
  /**
   * Base url for all requests (without origin). Should match with handler's prefix.
   *
   * @example '/rpc?base=1'
   *
   * @default '/'
   */
  url?: Value<Promisable<StandardUrl>, [options: ClientOptions<T>, path: string[], input: unknown]>

  /**
   * The maximum length of the URL.
   *
   * If the URL exceeds this length, the codec should use the `fallbackMethod` to send the request with the payload in the body instead of the URL.
   *
   * @default 2083
   */
  maxUrlLength?: Value<Promisable<number>, [options: ClientOptions<T>, path: string[], input: unknown]>

  /**
   * The method used to make the request.
   *
   * @default 'POST'
   */
  method?: Value<Promisable<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'QUERY'>, [options: ClientOptions<T>, path: string[], input: unknown]>

  /**
   * The method to use when the payload cannot safely pass to the server with method return from method function.
   * GET is not allowed, it's very dangerous.
   *
   * @default 'POST'
   */
  fallbackMethod?: 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'QUERY'

  /**
   * Inject headers to the request.
   */
  headers?: Value<Promisable<StandardHeaders | Headers>, [options: ClientOptions<T>, path: string[], input: unknown]>

  /**
   * Override the default RPC serializer.
   */
  serializer?: Public<RPCSerializer>
}

const END_SLASH_REGEX = /\/$/

export class RPCLinkCodec<T extends ClientContext> implements StandardLinkCodec<T> {
  private readonly baseUrl: Exclude<RPCLinkCodecOptions<T>['url'], undefined>
  private readonly maxUrlLength: Exclude<RPCLinkCodecOptions<T>['maxUrlLength'], undefined>
  private readonly fallbackMethod: Exclude<RPCLinkCodecOptions<T>['fallbackMethod'], undefined>
  private readonly expectedMethod: Exclude<RPCLinkCodecOptions<T>['method'], undefined>
  private readonly headers: Exclude<RPCLinkCodecOptions<T>['headers'], undefined>
  private readonly serializer: Exclude<RPCLinkCodecOptions<T>['serializer'], undefined>

  constructor(
    options: RPCLinkCodecOptions<T>,
  ) {
    this.baseUrl = options.url ?? '/'
    this.maxUrlLength = options.maxUrlLength ?? 2083
    this.fallbackMethod = options.fallbackMethod ?? 'POST'
    this.expectedMethod = options.method ?? this.fallbackMethod
    this.headers = options.headers ?? {}
    this.serializer = options.serializer ?? new RPCSerializer()
  }

  async encodeInput(input: unknown, path: string[], options: ClientOptions<T>): Promise<StandardRequest> {
    let headers = toResolvedStandardHeaders(await value(this.headers, options, path, input))
    if (options.lastEventId !== undefined) {
      headers = mergeStandardHeaders(headers, { 'last-event-id': options.lastEventId })
    }

    const expectedMethod = await value(this.expectedMethod, options, path, input)
    const baseUrl = await value(this.baseUrl, options, path, input)

    const [pathname, search, hash] = parseStandardUrl(baseUrl)
    const newPathname = `${pathname.replace(END_SLASH_REGEX, '')}${pathToHttpPath(path)}` as StandardUrl
    const serialized = this.serializer.serialize(input)

    if (
      expectedMethod === 'GET'
      && !(serialized instanceof Blob)
      && !(serialized instanceof ReadableStream)
      && !(serialized instanceof FormData)
      && !isAsyncIteratorObject(serialized)
    ) {
      const maxUrlLength = await value(this.maxUrlLength, options, path, input)
      const mergedSearch = new URLSearchParams(search)
      mergedSearch.append('data', stringifyJSON(serialized) ?? '')
      const url = `${newPathname}?${mergedSearch}${hash ?? ''}` as StandardUrl

      if (url.length <= maxUrlLength) {
        return {
          body: undefined,
          method: expectedMethod,
          headers,
          url,
          signal: options.signal,
        }
      }
    }

    const url = `${newPathname}${search ?? ''}${hash ?? ''}` as StandardUrl

    return {
      url,
      method: expectedMethod === 'GET' ? this.fallbackMethod : expectedMethod,
      headers,
      body: serialized,
      signal: options.signal,
    }
  }

  async decodeResponse(response: StandardLazyResponse): Promise<StandardLinkCodecDecodedResponse> {
    const isOk = response.status < 400

    const body = await response.resolveBody()

    const deserialized = await (async () => {
      try {
        return this.serializer.deserialize(body)
      }
      catch (cause) {
        throw new MalformedResponseError({
          message: 'Invalid RPC response format.',
          response: { status: response.status, headers: response.headers, body },
          cause,
        })
      }
    })()

    if (!isOk) {
      if (isORPCErrorJson(deserialized)) {
        return { kind: 'error', error: createORPCErrorFromJson(deserialized) }
      }

      throw new MalformedResponseError({ response: { headers: response.headers, status: response.status, body } })
    }

    return { kind: 'output', output: deserialized }
  }
}

function toResolvedStandardHeaders(headers: Headers | StandardHeaders): StandardHeaders {
  /**
   * Headers class might not be available in some environments,
   * so we check for the existence of `forEach` and `get`
   * methods to determine if it's a Headers instance.
   */
  if (typeof headers.forEach === 'function') {
    return toStandardHeaders(headers as Headers)
  }

  return headers as StandardHeaders
}
