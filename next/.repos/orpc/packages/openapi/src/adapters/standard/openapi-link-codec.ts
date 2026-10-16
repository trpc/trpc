import type { AnyORPCError, ClientContext, ClientOptions } from '@orpc/client'
import type { StandardLinkCodec, StandardLinkCodecDecodedResponse } from '@orpc/client/standard'
import type { AnyProcedureContract, RouterContract } from '@orpc/contract'
import type { Promisable, Public, Value } from '@orpc/shared'
import type { StandardHeaders, StandardLazyResponse, StandardRequest, StandardUrl } from '@standard-server/core'
import type { OpenAPIMeta } from '../../meta'
import { createORPCErrorFromJson, isORPCErrorJson, MalformedResponseError } from '@orpc/client'
import { getRouterContract, ProcedureContract } from '@orpc/contract'
import { unlazy } from '@orpc/server'
import { isTypescriptObject, mergeHttpPath, pathToHttpPath, safeEncodeURIComponent, stringifyJSON, value } from '@orpc/shared'
import { mergeStandardHeaders, parseStandardUrl } from '@standard-server/core'
import { toStandardHeaders } from '@standard-server/fetch'
import {
  DEFAULT_OPENAPI_INPUT_STRUCTURE,
  DEFAULT_OPENAPI_METHOD,
  DEFAULT_OPENAPI_OUTPUT_STRUCTURE,
} from '../../constants'
import { getOpenAPIMeta } from '../../meta'
import { OpenAPISerializer } from '../../openapi-serializer'
import { getDynamicPathParams, isBodylessMethod } from '../../utils'
import { serializeHeaders } from './utils'

export interface OpenAPILinkCodecOptions<T extends ClientContext> {
  /**
   * Base URL for all requests, without origin. Should match the OpenAPI handler mount path.
   *
   * @example '/api'
   * @default '/'
   */
  url?: Value<Promisable<StandardUrl>, [options: ClientOptions<T>, path: string[], input: unknown]>

  /**
   * Inject headers into the request.
   */
  headers?: Value<Promisable<StandardHeaders | Headers>, [options: ClientOptions<T>, path: string[], input: unknown]>

  /**
   * Override the default OpenAPI serializer.
   */
  serializer?: Public<OpenAPISerializer>

  /**
   * Customize how an error response body is converted into an ORPC error.
   * Return `null` or `undefined` to fall back to the default decoding behavior.
   */
  customErrorResponseBodyDecoder?: (
    deserializedBody: unknown,
    response: StandardLazyResponse,
  ) => AnyORPCError | null | undefined
}

const END_SLASH_REGEX = /\/$/
const DOT_SEGMENT_REGEX = /(?:^|\/)\.{1,2}(?:\/|$)/

export class OpenAPILinkCodec<T extends ClientContext> implements StandardLinkCodec<T> {
  private readonly baseUrl: Exclude<OpenAPILinkCodecOptions<T>['url'], undefined>
  private readonly headers: Exclude<OpenAPILinkCodecOptions<T>['headers'], undefined>
  private readonly serializer: Exclude<OpenAPILinkCodecOptions<T>['serializer'], undefined>
  private readonly customErrorResponseBodyDecoder: OpenAPILinkCodecOptions<T>['customErrorResponseBodyDecoder']

  constructor(
    private readonly router: RouterContract,
    options: OpenAPILinkCodecOptions<T> = {},
  ) {
    this.baseUrl = options.url ?? '/'
    this.headers = options.headers ?? {}
    this.serializer = options.serializer ?? new OpenAPISerializer()
    this.customErrorResponseBodyDecoder = options.customErrorResponseBodyDecoder
  }

  async encodeInput(input: unknown, path: string[], options: ClientOptions<T>): Promise<StandardRequest> {
    let headers = toResolvedStandardHeaders(await value(this.headers, options, path, input))
    if (options.lastEventId !== undefined) {
      headers = mergeStandardHeaders(headers, { 'last-event-id': options.lastEventId })
    }

    const baseUrl = await value(this.baseUrl, options, path, input)
    const procedure = await this.resolveProcedure(path)
    const meta = getOpenAPIMeta(procedure)

    const method = meta?.method ?? DEFAULT_OPENAPI_METHOD
    const inputStructure = meta?.inputStructure ?? DEFAULT_OPENAPI_INPUT_STRUCTURE
    let pathname = meta?.path ?? pathToHttpPath(path)
    if (meta?.prefix) {
      pathname = mergeHttpPath(meta.prefix, pathname)
    }

    const [basePathname, baseSearch, baseHash] = parseStandardUrl(baseUrl)
    const dynamicParams = getDynamicPathParams(pathname)

    if (inputStructure === 'compact') {
      let data = input

      if (dynamicParams?.length) {
        if (!isTypescriptObject(input)) {
          throw new TypeError(
            `Input must be an object with "compact" input structure when the path has dynamic params (${dynamicParams.map(p => p.parameterName).join(', ')}) in call to procedure (${path.join('.')}).`,
          )
        }

        const remaining = { ...input }

        for (let i = dynamicParams.length - 1; i >= 0; i--) {
          const param = dynamicParams[i]!
          const encoded = this.encodePathParam(input[param.parameterName], param, meta?.paramsStyles?.[param.parameterName], path)
          pathname = `${pathname.slice(0, param.startIndex)}${encoded}${pathname.slice(param.startIndex + param.segment.length)}` as `/${string}`
          delete remaining[param.parameterName]
        }

        data = Object.keys(remaining).length > 0 ? remaining : undefined
      }

      pathname = `${basePathname.replace(END_SLASH_REGEX, '')}${pathname}` as `/${string}`

      if (isBodylessMethod(method)) {
        const queryString = this.serializeQueryString(data, meta?.queryStyles)
        const search = combineSearch(baseSearch, queryString)
        const url = `${pathname}${search ?? ''}${baseHash ?? ''}` as StandardUrl

        return {
          body: undefined,
          method,
          headers,
          url,
          signal: options.signal,
        }
      }

      const url = `${pathname}${baseSearch ?? ''}${baseHash ?? ''}` as StandardUrl

      return {
        url,
        method,
        headers,
        body: this.serializer.serialize(data),
        signal: options.signal,
      }
    }

    if (!isValidDetailedInput(input)) {
      throw new TypeError(`
        Invalid "detailed" input structure in call to procedure (${path.join('.')}):
        • Expected an object or undefined with optional properties:
          - params (object, required when the path has dynamic params)
          - query (object)
          - headers (object)
          - body (any)

        Actual value:
          ${stringifyJSON(input)}
      `)
    }

    if (dynamicParams?.length) {
      if (!input?.params) {
        throw new TypeError(
          `The "params" property is required for "detailed" input when the path has dynamic params (${dynamicParams.map(p => p.parameterName).join(', ')}) in call to procedure (${path.join('.')}).`,
        )
      }

      for (let i = dynamicParams.length - 1; i >= 0; i--) {
        const param = dynamicParams[i]!
        const val = input.params[param.parameterName]
        const encoded = this.encodePathParam(val, param, meta?.paramsStyles?.[param.parameterName], path)
        pathname = `${pathname.slice(0, param.startIndex)}${encoded}${pathname.slice(param.startIndex + param.segment.length)}` as `/${string}`
      }
    }

    if (input?.headers) {
      headers = mergeStandardHeaders(headers, serializeHeaders(input.headers, this.serializer))
    }

    pathname = `${basePathname.replace(END_SLASH_REGEX, '')}${pathname}` as `/${string}`
    const queryString = this.serializeQueryString(input?.query, meta?.queryStyles)
    const search = combineSearch(baseSearch, queryString)
    const url = `${pathname}${search ?? ''}${baseHash ?? ''}` as StandardUrl

    if (isBodylessMethod(method)) {
      return {
        body: undefined,
        method,
        headers,
        url,
        signal: options.signal,
      }
    }

    return {
      url,
      method,
      headers,
      body: this.serializer.serialize(input?.body),
      signal: options.signal,
    }
  }

  private encodePathParam(
    val: unknown,
    param: { parameterName: string, allowsSlash: boolean, segment: string },
    style: Exclude<OpenAPIMeta['paramsStyles'], undefined>[string],
    path: string[],
  ): string {
    let encoded: string | undefined

    if (style === 'comma-delimited-array' && Array.isArray(val)) {
      encoded = val
        .map(val => this.serializer.serialize(val))
        .filter(val => val !== undefined && val !== null)
        .map(val => safeEncodeURIComponent(String(val)))
        .join(',')
    }
    else if (style === 'comma-delimited-object' && isTypescriptObject(val)) {
      encoded = Object.entries(val)
        .map(([key, val]) => [key, this.serializer.serialize(val)])
        .filter(([, val]) => val !== undefined && val !== null)
        .map(([key, val]) => `${safeEncodeURIComponent(String(key))},${safeEncodeURIComponent(String(val))}`)
        .join(',')
    }
    else {
      const serialized = this.serializer.serialize(val)

      if (serialized !== undefined && serialized !== null) {
        if (param.allowsSlash) {
          encoded = String(serialized).split('/').map(safeEncodeURIComponent).join('/')
        }
        else {
          encoded = safeEncodeURIComponent(String(serialized))
        }
      }
    }

    if (!encoded) {
      throw new TypeError(`Path param "${param.parameterName}" cannot be empty in call to procedure (${path.join('.')}).`)
    }

    // URL parsing (e.g. in fetch) resolves "." and ".." segments, which would send the request to a different endpoint
    if (DOT_SEGMENT_REGEX.test(encoded)) {
      throw new TypeError(`Path param "${param.parameterName}" cannot contain "." or ".." segments in call to procedure (${path.join('.')}).`)
    }

    if (encoded.startsWith('/')) {
      encoded = `%2F${encoded.slice(1)}`
    }

    return encoded
  }

  private serializeQueryString(data: unknown, queryStyles: OpenAPIMeta['queryStyles']): string | undefined {
    if (!queryStyles || !isTypescriptObject(data)) {
      return toURLSearchParams(
        this.serializer.serialize(data, { asFormData: true }) as FormData,
      ).toString()
    }

    const remaining = { ...data }
    let query = ''

    Object.entries(queryStyles).forEach(([key, style]) => {
      if (style === undefined) {
        return
      }

      const value = remaining[key]
      delete remaining[key]

      if (style === 'primitive') {
        const serialized = this.serializer.serialize(value)
        if (serialized !== undefined && serialized !== null) {
          query += `&${encodeURLSearchParamComponent(key)}=${encodeURLSearchParamComponent(String(serialized))}`
        }
      }

      else if (style === 'array' && Array.isArray(value)) {
        const encodedKey = encodeURLSearchParamComponent(key)

        value.forEach((v) => {
          const s = this.serializer.serialize(v)
          if (s !== undefined && s !== null) {
            query += `&${encodedKey}=${encodeURLSearchParamComponent(String(s))}`
          }
        })
      }

      else if (style === 'json') {
        const serialized = this.serializer.serialize(value)

        if (serialized !== undefined) {
          query += `&${encodeURLSearchParamComponent(key)}=${encodeURLSearchParamComponent(stringifyJSON(serialized))}`
        }
      }

      else if (style === 'comma-delimited-array' && Array.isArray(value)) {
        const encodedValue = encodeDelimitedArray(
          value.map(v => this.serializer.serialize(v)),
          ',',
        )

        if (encodedValue !== undefined) {
          query += `&${encodeURLSearchParamComponent(key)}=${encodedValue}`
        }
      }

      else if (style === 'comma-delimited-object' && isTypescriptObject(value)) {
        const encodedValue = encodeDelimitedObject(
          Object.entries(value).map(([key, value]) => [key, this.serializer.serialize(value)]),
          ',',
        )

        if (encodedValue !== undefined) {
          query += `&${encodeURLSearchParamComponent(key)}=${encodedValue}`
        }
      }

      else if (style === 'pipe-delimited-array' && Array.isArray(value)) {
        const encodedValue = encodeDelimitedArray(
          value.map(v => this.serializer.serialize(v)),
          '%7C' /* '/' */,
        )

        if (encodedValue !== undefined) {
          query += `&${encodeURLSearchParamComponent(key)}=${encodedValue}`
        }
      }

      else if (style === 'pipe-delimited-object' && isTypescriptObject(value)) {
        const encodedValue = encodeDelimitedObject(
          Object.entries(value).map(([key, value]) => [key, this.serializer.serialize(value)]),
          '%7C' /* '/' */,
        )

        if (encodedValue !== undefined) {
          query += `&${encodeURLSearchParamComponent(key)}=${encodedValue}`
        }
      }

      else if (style === 'space-delimited-array' && Array.isArray(value)) {
        const encodedValue = encodeDelimitedArray(
          value.map(v => this.serializer.serialize(v)),
          '%20' /* ' ' */,
        )

        if (encodedValue !== undefined) {
          query += `&${encodeURLSearchParamComponent(key)}=${encodedValue}`
        }
      }

      else if (style === 'space-delimited-object' && isTypescriptObject(value)) {
        const encodedValue = encodeDelimitedObject(
          Object.entries(value).map(([key, value]) => [key, this.serializer.serialize(value)]),
          '%20' /* ' ' */,
        )

        if (encodedValue !== undefined) {
          query += `&${encodeURLSearchParamComponent(key)}=${encodedValue}`
        }
      }

      else {
        const serialized = this.serializer.serialize(value)
        if (serialized !== undefined && serialized !== null) {
          query += `&${encodeURLSearchParamComponent(key)}=${encodeURLSearchParamComponent(String(serialized))}`
        }
      }
    })

    const form = this.serializer.serialize(remaining, { asFormData: true }) as FormData
    query = `${toURLSearchParams(form).toString()}${query}`

    if (query.startsWith('&')) {
      query = query.slice(1)
    }

    return query || undefined
  }

  async decodeResponse(
    response: StandardLazyResponse,
    path: string[],
    _options: ClientOptions<T>,
  ): Promise<StandardLinkCodecDecodedResponse> {
    const isOk = response.status < 400
    const procedure = await this.resolveProcedure(path)
    const meta = getOpenAPIMeta(procedure)

    const body = await response.resolveBody(meta?.responseBodyHint)

    const deserialized = await (async () => {
      try {
        return this.serializer.deserialize(body)
      }
      catch (error) {
        throw new MalformedResponseError({
          message: 'Invalid OpenAPI response format.',
          response: { status: response.status, headers: response.headers, body },
          cause: error,
        })
      }
    })()

    if (!isOk) {
      const customError = this.customErrorResponseBodyDecoder?.(deserialized, response)

      if (customError !== undefined && customError !== null) {
        return { kind: 'error', error: customError }
      }

      if (isORPCErrorJson(deserialized)) {
        return { kind: 'error', error: createORPCErrorFromJson(deserialized) }
      }

      throw new MalformedResponseError({ response: { headers: response.headers, status: response.status, body } })
    }

    const outputStructure = meta?.outputStructure ?? DEFAULT_OPENAPI_OUTPUT_STRUCTURE

    return outputStructure === 'compact'
      ? { kind: 'output', output: deserialized }
      : {
          kind: 'output',
          output: {
            status: response.status,
            headers: response.headers,
            body: deserialized,
          },
        }
  }

  private async resolveProcedure(path: string[]): Promise<AnyProcedureContract> {
    const { default: maybeProcedure } = await unlazy(getRouterContract(this.router, path))

    if (!(maybeProcedure instanceof ProcedureContract)) {
      throw new TypeError(`Expected a procedure or contract at path (${path.join('.')})`)
    }

    return maybeProcedure
  }
}

function combineSearch(baseSearch: `?${string}` | undefined, additionalSearch: string | undefined): `?${string}` | undefined {
  if (!baseSearch && !additionalSearch) {
    return undefined
  }

  if (!additionalSearch) {
    return baseSearch
  }

  if (!baseSearch) {
    return `?${additionalSearch}` as `?${string}`
  }

  return `${baseSearch}&${additionalSearch}` as `?${string}`
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

function isValidDetailedInput(
  input: unknown,
): input is undefined | { params?: Record<string, unknown>, query?: Record<string, unknown>, headers?: object, body?: unknown } {
  if (!isTypescriptObject(input)) {
    return input === undefined
  }

  if (input.params !== undefined && !isTypescriptObject(input.params)) {
    return false
  }

  if (input.query !== undefined && !isTypescriptObject(input.query)) {
    return false
  }

  if (input.headers !== undefined && !isTypescriptObject(input.headers)) {
    return false
  }

  return true
}

/**
 * Encode a query parameter value using URLSearchParams semantics.
 * Prefer this over safeEncodeURIComponent for query-string values.
 */
function encodeURLSearchParamComponent(value: string): string {
  return new URLSearchParams({ '': value }).toString().slice(1)
}

function toURLSearchParams(form: FormData): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of form) {
    params.append(key, String(value))
  }
  return params
}

function encodeDelimitedArray(serializedValues: unknown[], encodedDelimiter: string): string | undefined {
  const strings = serializedValues.filter(v => v !== null && v !== undefined).map(String)

  if (!strings.length) {
    return undefined
  }

  return strings.map(encodeURLSearchParamComponent).join(encodedDelimiter)
}

function encodeDelimitedObject(entries: [string, unknown][], encodedDelimiter: string): string | undefined {
  const strings = entries
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => [k, String(v)]) as [string, string][]

  if (!strings.length) {
    return undefined
  }

  return strings
    .map(
      ([key, value]) => `${encodeURLSearchParamComponent(key)}${encodedDelimiter}${encodeURLSearchParamComponent(value)}`,
    )
    .join(encodedDelimiter)
}
