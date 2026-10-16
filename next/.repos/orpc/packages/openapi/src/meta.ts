import type { AnyProcedureContract, AnySchema, ErrorMap, MetaPlugin } from '@orpc/contract'
import type { Lazy } from '@orpc/server'
import type { Value } from '@orpc/shared'
import type { StandardBodyHint } from '@standard-server/core'
import type { OpenAPIV3_2 } from './types'
import { mergeHttpPath } from '@orpc/shared'

export interface OpenAPIMeta {
  /**
   * HTTP method accepted by this procedure.
   *
   * @default 'POST'
   */
  method?: 'HEAD' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'QUERY' | undefined

  /**
   * URL path for this procedure. Supports dynamic parameters via `{param}` syntax,
   * and `{+param}` to allow slashes in the matched value.
   *
   * @example `/users`, `/users/{id}`, `/files/{+path}`
   * @default Router segments joined by `'/`
   */
  path?: `/${string}` | undefined

  /**
   * Unique identifier for this operation in the OpenAPI spec.
   *
   * @default Router segments joined by `.`
   */
  operationId?: string | undefined

  /**
   * Short summary of the procedure, used as the operation summary in the generated spec.
   */
  summary?: string | undefined

  /**
   * Detailed description of the procedure, used as the operation description in the generated spec.
   */
  description?: string | undefined

  /**
   * Marks the procedure as deprecated in the generated spec.
   */
  deprecated?: boolean | undefined

  /**
   * Tags associated with this procedure.
   *
   * **Merging**: When defined multiple times, tags are concatenated in definition order.
   * Explicitly setting `undefined` resets the tags instead of merging.
   */
  tags?: string[] | undefined

  /**
   * HTTP status code returned on success.
   * Should be in the `2xx` range and must be less than `400`.
   *
   * @default 200
   */
  successStatus?: number | undefined

  /**
   * Description of the successful response.
   *
   * @default 'OK'
   */
  successDescription?: string | undefined

  /**
   * Controls how individual path parameters are decoded.
   *
   * **Merging**: When defined multiple times, styles are merged per parameter.
   * The most recent style defined for a parameter wins.
   * Explicitly setting `undefined` resets the styles instead of merging.
   *
   * Each key maps a path parameter name to one of the following strategies:
   *
   * | Strategy                 | Encoded path segment | Decoded                      | OpenAPI Parameter Style          |
   * |--------------------------|----------------------|------------------------------|----------------------------------|
   * | `primitive` *(default)*  | `/users/42`          | `{ id: '42' }`               | `simple`                         |
   * | `comma-delimited-array`  | `/users/a,b,c`       | `{ id: ['a', 'b', 'c'] }`    | `simple`                         |
   * | `comma-delimited-object` | `/users/a,1,b,2`     | `{ id: { a: '1', b: '2' } }` | `simple`                         |
   *
   * **Strategy details:**
   *
   * - **`primitive`**: Keeps the decoded path segment as a string.
   * - **`comma-delimited-array`**: Splits the decoded path segment on `,` into an array.
   * - **`comma-delimited-object`**: Splits the decoded path segment on `,` into alternating key-value pairs.
   *
   * **Note**: `*-delimited-*` strategies do not support keys or values containing the delimiter character.
   *
   * @example
   * ```ts
   * // openapi.path = '/users/{id}/{tags}/{filters}'
   * // GET /users/42/red,blue/size,large,brand,nike
   *
   * const paramsStyles = {
   *   id: 'primitive',
   *   tags: 'comma-delimited-array',
   *   filters: 'comma-delimited-object',
   * }
   *
   * const inputSchema = z.object({
   *   id: z.string(),
   *   tags: z.array(z.string()),
   *   filters: z.object({
   *     size: z.string(),
   *     brand: z.string(),
   *   }),
   * })
   * ```
   *
   * @default `primitive` for all parameters
   */
  paramsStyles?: Record<
    string,
    'primitive' | 'comma-delimited-array' | 'comma-delimited-object' | undefined
  > | undefined

  /**
   * Controls how individual query parameters are encoding/decoding.
   *
   * **Merging**: When defined multiple times, styles are merged per parameter.
   * The most recent style defined for a parameter wins.
   * Explicitly setting `undefined` resets the styles instead of merging.
   *
   * Each key maps a query parameter name to one of the following strategies:
   *
   * | Strategy                 | Encoded                   | Decoded                        | OpenAPI Parameter Style            |
   * |--------------------------|---------------------------|--------------------------------|------------------------------------|
   * | `primitive`              | `?a=1&a=2`                | `{ a: '2' }`                   | `form` / `explode: false`          |
   * | `array`                  | `?a=1&a=2`                | `{ a: ['1', '2'] }`            | `form` / `explode: true`           |
   * | `comma-delimited-array`  | `?a=1,2,3`                | `{ a: ['1', '2', '3'] }`       | `form` / `explode: false`          |
   * | `comma-delimited-object` | `?a=A,1,B,2`              | `{ a: { A: '1', B: '2' } }`    | `form` / `explode: false`          |
   * | `space-delimited-array`  | `?a=1 2 3`                | `{ a: ['1', '2', '3'] }`       | `spaceDelimited` / `explode: false`|
   * | `space-delimited-object` | `?a=A 1 B 2`              | `{ a: { A: '1', B: '2' } }`    | `spaceDelimited` / `explode: false`|
   * | `pipe-delimited-array`   | `?a=1\|2\|3`              | `{ a: ['1', '2', '3'] }`       | `pipeDelimited` / `explode: false` |
   * | `pipe-delimited-object`  | `?a=A\|1\|B\|2`           | `{ a: { A: '1', B: '2' } }`    | `pipeDelimited` / `explode: false` |
   * | `json`                   | `?meta={"key":"value"}`   | `{ meta: { key: 'value' } }`   | `content: application/json`        |
   * | _default_              | `?a[]=1&a[]=2&b=3&c[d]=4` | `{a:['1', '2'], b:3, c:{d:4}}` | `deepObject` / `explode: true`     |
   *
   * **Strategy details:**
   *
   * - **`primitive`**: Takes the last occurrence of a repeated parameter.
   * - **`array`**: Always produces an array, even for a single occurrence.
   * - **`*-delimited-array`**: Splits the last value on the delimiter (`,`, space, or `|`) into an array.
   * - **`*-delimited-object`**: Splits the last value on the delimiter into alternating key–value pairs.
   * - **`json`**: Parses the last value as JSON; falls back to the raw string if parsing fails.
   * - **`undefined`**: Standard bracket-notation decoding This is the default.
   *
   * **Note**: `*-delimited-*` strategies do not support keys or values containing the delimiter character.
   *
   * @example
   * ```ts
   * // GET /search?keyword=abc&tags=a,b,c&meta={"key":"value"}
   * const queryParsing = {
   *   keyword: 'primitive',
   *   tags: 'comma-delimited-array',
   *   meta: 'json',
   * }
   *
   * const inputSchema = z.object({
   *   keyword: z.string(),
   *   tags: z.array(z.string()),
   *   meta: z.object({ key: z.string() }),
   * })
   * ```
   *
   * @default `undefined` for all parameters (bracket-notation decoding)
   */
  queryStyles?: Record<
    string,
    'primitive' | 'array' | 'comma-delimited-array' | 'comma-delimited-object' | 'space-delimited-array' | 'space-delimited-object' | 'pipe-delimited-array' | 'pipe-delimited-object' | 'json' | undefined
  > | undefined

  /**
   * Hint for how to parse the incoming request body.
   *
   * Note: The `standard-server` `Content-Type` header takes priority over this option.
   * `form-data` and `url-search-params` are decoded using bracket notation,
   * so the resulting value will be an object or array.
   *
   * @default Inferred from `Content-Type`, `Content-Disposition`, and `Content-Length`
   */
  requestBodyHint?: StandardBodyHint | undefined

  /**
   * Hint for how to parse the response body.
   *
   * Note: The `standard-server` `Content-Type` header takes priority over this option.
   * `form-data` and `url-search-params` are decoded using bracket notation,
   * so the resulting value will be an object or array.
   *
   * @default Inferred from `Content-Type`, `Content-Disposition`, and `Content-Length`
   */
  responseBodyHint?: StandardBodyHint | undefined

  /**
   * Determines how the input should be structured
   * based on params, query, headers, and body.
   *
   * - `compact` — Merges params with either query or body
   *   (depending on the HTTP method) into a single flat object.
   *   Use this when you don't need access to headers and your
   *   param/query/body keys don't conflict.
   *
   *   ```ts
   *   // GET /users/42?search=hello
   *   const inputValue = { id: 42, search: 'hello' }
   *
   *   const inputSchema = z.object({
   *     id: z.coerce.number(),  // from params
   *     search: z.string(),     // from query
   *   })
   *   ```
   *
   * - `detailed` — Keeps each part of the request as a
   *   separate nested field. Use this when you need access
   *   to headers, or when params and query/body keys
   *   might conflict.
   *
   *   ```ts
   *   const inputValue = {
   *     params:  { id: 1 },
   *     query:   { search: 'hello' },
   *     headers: { 'content-type': 'application/json' },
   *     body:    'body value',
   *   }
   *
   *   const inputSchema = z.object({
   *     params:  z.object({ id: z.coerce.number() }),
   *     query:   z.object({ search: z.string() }),
   *     headers: z.object({ 'content-type': z.string() }),
   *     body:    z.string(),
   *   })
   *   ```
   *
   * @default 'compact'
   */
  inputStructure?: 'compact' | 'detailed' | undefined

  /**
   * Determines how the output should be structured
   * into the HTTP response.
   *
   * - `compact` — The return value is sent directly as the
   *   response body. Status code comes from successStatus.
   *
   *   ```ts
   *   const outputValue = { id: 1, name: 'Alice' }
   *
   *   const outputSchema = z.object({
   *     id: z.number(),
   *     name: z.string(),
   *   })
   *   ```
   *
   * - `detailed` — Return an object with optional properties:
   *   - status: HTTP status code (200–399). Defaults to
   *     successStatus if omitted. Use a literal type
   *     (e.g. z.literal(201)) so the generated spec can reflects
   *     the exact code.
   *   - headers: Custom headers to merge into the response
   *     (Record<string, string | string[] | undefined>).
   *   - body: The response body.
   *
   *   ```ts
   *   const outputValue = {
   *     status: 201,
   *     headers: { 'x-custom-header': 'value' },
   *     body: 'body value',
   *   }
   *
   *   const outputSchema = z.object({
   *     status: z.literal(201).meta({ description: 'Record Created' }),
   *     headers: z.object({ 'x-custom-header': z.string() }),
   *     body: z.string(),
   *   })
   *   ```
   *
   * @default 'compact'
   */
  outputStructure?: 'compact' | 'detailed' | undefined

  /**
   * Override or extend the generated OpenAPI operation object for this procedure.
   *
   * Pass a plain object to replace entire operation object, or a function that receives the current
   * operation object and returns the modified version.
   *
   * The operation object always follows OpenAPI 3.2, `OpenAPIGenerator` downgrades it with the
   * rest of the document when an older version is requested.
   *
   * **Merging**: When defined multiple times:
   *
   * - Two functions are chained: the most recent function receives the result of the previous one.
   * - A function combined with an object: the function is applied to that object.
   * - Two objects: the most recent object wins.
   *
   * Explicitly setting `undefined` resets the spec instead of merging.
   */
  spec?: Value<OpenAPIV3_2.OperationObject, [current: OpenAPIV3_2.OperationObject]>

  /**
   * Prefix for the path. Useful when you want to apply a common path prefix across multiple procedures.
   *
   * **Merging**: When defined multiple times, prefixes are concatenated in definition order.
   * Explicitly setting `undefined` resets the prefix instead of merging.
   */
  prefix?: `/${string}` | undefined
}

export interface OpenAPIMetaPlugin<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> extends MetaPlugin<TInputSchema, TOutputSchema, TErrorMap> {
  name: '~openapi'
}

export interface OpenAPIMethodMetaPlugin<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> extends MetaPlugin<TInputSchema, TOutputSchema, TErrorMap> {
  name: '~openapi/method'
}

export interface OpenAPIPathMetaPlugin<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> extends MetaPlugin<TInputSchema, TOutputSchema, TErrorMap> {
  name: '~openapi/path'
}

export interface OpenAPISpecMetaPlugin<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> extends MetaPlugin<TInputSchema, TOutputSchema, TErrorMap> {
  name: '~openapi/spec'
}

export interface OpenAPIPrefixMetaPlugin<
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> extends MetaPlugin<TInputSchema, TOutputSchema, TErrorMap> {
  name: '~openapi/prefix'
}

export interface OpenAPIFunction {
  (meta: OpenAPIMeta): OpenAPIMetaPlugin<any, any, any>
  method(method: OpenAPIMeta['method']): OpenAPIMethodMetaPlugin<any, any, any>
  path(method: OpenAPIMeta['path']): OpenAPIPathMetaPlugin<any, any, any>
  spec(method: OpenAPIMeta['spec']): OpenAPISpecMetaPlugin<any, any, any>
  prefix(method: OpenAPIMeta['prefix']): OpenAPIPrefixMetaPlugin<any, any, any>
}

/**
 * Creates OpenAPI meta plugins that control how a procedure is exposed over HTTP,
 * such as its method, path, prefix, and OpenAPI operation spec.
 *
 * @see {@link https://orpc.dev/docs/openapi/routing | OpenAPI Routing}
 * @see {@link https://orpc.dev/docs/openapi/specification | OpenAPI Specification}
 */
export const openapi: OpenAPIFunction = incoming => ({
  name: '~openapi',
  init(meta) {
    const existing = meta['~openapi'] as undefined | OpenAPIMeta

    const tags = existing?.tags && incoming.tags
      ? [...existing.tags, ...incoming.tags]
      : 'tags' in incoming ? incoming.tags : existing?.tags

    const queryStyles = existing?.queryStyles && incoming.queryStyles
      ? { ...existing.queryStyles, ...incoming.queryStyles }
      : 'queryStyles' in incoming ? incoming.queryStyles : existing?.queryStyles

    const paramsStyles = existing?.paramsStyles && incoming.paramsStyles
      ? { ...existing.paramsStyles, ...incoming.paramsStyles }
      : 'paramsStyles' in incoming ? incoming.paramsStyles : existing?.paramsStyles

    const existingSpec = existing?.spec
    const incomingSpec = incoming.spec

    // AVOID a function spec, it requires the current spec as an argument, triggering an extra auto-generation step.
    const spec: OpenAPIMeta['spec']
      = typeof existingSpec === 'function' && typeof incomingSpec === 'function'
        ? current => incomingSpec(existingSpec(current))
        : typeof existingSpec === 'function' && typeof incomingSpec === 'object'
          ? existingSpec(incomingSpec)
          : typeof existingSpec === 'object' && typeof incomingSpec === 'function'
            ? incomingSpec(existingSpec)
            : 'spec' in incoming ? incomingSpec : existingSpec

    const prefix = existing?.prefix && incoming.prefix
      ? mergeHttpPath(existing.prefix, incoming.prefix)
      : 'prefix' in incoming ? incoming.prefix : existing?.prefix

    // TODO: throw if incoming.path missing dynamic from existing.path

    const merged: OpenAPIMeta = {
      ...existing,
      ...incoming,
      tags,
      queryStyles,
      paramsStyles,
      spec,
      prefix,
    }

    return {
      ...meta,
      '~openapi': merged,
    }
  },
})

openapi.method = method => ({
  ...openapi({ method }),
  name: '~openapi/method',
})

openapi.path = path => ({
  ...openapi({ path }),
  name: '~openapi/path',
})

openapi.spec = spec => ({
  ...openapi({ spec }),
  name: '~openapi/spec',
})

openapi.prefix = prefix => ({
  ...openapi({ prefix }),
  name: '~openapi/prefix',
})

/**
 * Retrieves the OpenAPI metadata attached to a procedure or router, or `undefined` if not set.
 *
 * @see {@link https://orpc.dev/docs/rpc/handler#enabling-the-get-method | RPC Handler - Enabling the GET Method}
 */
export function getOpenAPIMeta(procedureOrLazy: AnyProcedureContract | Lazy<any>): OpenAPIMeta | undefined {
  return procedureOrLazy['~orpc'].meta['~openapi'] as OpenAPIMeta | undefined
}
