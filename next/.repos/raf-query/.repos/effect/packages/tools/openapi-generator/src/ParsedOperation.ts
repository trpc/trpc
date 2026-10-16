/**
 * Normalized OpenAPI operation model shared by the generator pipeline.
 *
 * This module records the shape produced after an OpenAPI document is resolved
 * into stable generator inputs: document metadata, tags, security schemes,
 * per-operation parameters, request bodies, response media types, derived
 * schema references, path templates, and streaming capabilities. Renderers
 * consume this representation to emit HttpClient or HttpApi modules without
 * reinterpreting raw OpenAPI path-item structures.
 *
 * @since 4.0.0
 */
import type {
  OpenAPISecurityRequirement,
  OpenAPISpecExternalDocs,
  OpenAPISpecLicense,
  OpenAPISpecServer
} from "effect/http-api/OpenApi"
import type { HttpMethod } from "effect/http/HttpMethod"
import type * as Types from "effect/Types"

/**
 * Root OpenAPI metadata preserved for generated client and HttpApi output.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedOpenApiMetadata {
  readonly title: string
  readonly version: string
  readonly summary: string | undefined
  readonly description: string | undefined
  readonly license: OpenAPISpecLicense | undefined
  readonly servers: ReadonlyArray<OpenAPISpecServer> | undefined
}

/**
 * Tag metadata used to group and annotate generated operations.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedOpenApiTag {
  readonly name: string
  readonly description: string | undefined
  readonly externalDocs: OpenAPISpecExternalDocs | undefined
}

/**
 * Supported security scheme extracted from an OpenAPI components section.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedOpenApiSecurityScheme {
  readonly name: string
  readonly type: "basic" | "bearer" | "apiKey" | "http"
  readonly description: string | undefined
  readonly bearerFormat: string | undefined
  readonly scheme: string | undefined
  readonly key: string | undefined
  readonly in: "header" | "query" | "cookie" | undefined
}

/**
 * Normalized OpenAPI document consumed by the generator renderers.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedOpenApi {
  readonly metadata: ParsedOpenApiMetadata
  readonly tags: ReadonlyArray<ParsedOpenApiTag>
  readonly securitySchemes: ReadonlyArray<ParsedOpenApiSecurityScheme>
  readonly operations: ReadonlyArray<ParsedOperation>
}

/**
 * Documentation and lifecycle metadata associated with an operation.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedOperationMetadata {
  readonly summary: string | undefined
  readonly description: string | undefined
  readonly deprecated: boolean
  readonly externalDocs: OpenAPISpecExternalDocs | undefined
}

/**
 * Resolved OpenAPI parameter grouped by where it appears in the request.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedOperationParameter {
  readonly name: string
  readonly in: "path" | "query" | "header" | "cookie"
  readonly required: boolean
  readonly description: string | undefined
  readonly schema: {}
}

/**
 * Summary of the request body declaration before per-media schemas are rendered.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedOperationRequestBody {
  readonly required: boolean
  readonly contentTypes: Array<string>
}

/**
 * Encoding strategy the generator can use for a request or response media type.
 *
 * @category models
 * @since 4.0.0
 */
export type ParsedOperationMediaTypeEncoding =
  | "json"
  | "multipart"
  | "form-url-encoded"
  | "text"
  | "binary"

/**
 * Media type whose schema can be represented in generated Effect code.
 *
 * @category models
 * @since 4.0.0
 */
export type ParsedOperationMediaTypeSchema =
  | {
    readonly contentType: string
    readonly encoding: ParsedOperationMediaTypeEncoding
    readonly schema: string
    readonly effectStream?: undefined
  }
  | {
    readonly contentType: string
    readonly encoding: "text"
    readonly schema: string
    readonly effectStream: "sse"
    readonly errorSchema: string
  }
  | {
    readonly contentType: string
    readonly encoding: "binary"
    readonly schema?: undefined
    readonly effectStream: "uint8array"
  }

/**
 * Parsed response metadata together with generated schema references.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedOperationResponse {
  readonly status: string
  readonly description: string | undefined
  readonly contentTypes: Array<string>
  readonly hasHeaders: boolean
  readonly isEmpty: boolean
  readonly representable: ReadonlyArray<ParsedOperationMediaTypeSchema>
}

/**
 * Resolved security requirement applied to a parsed operation.
 *
 * @category models
 * @since 4.0.0
 */
export type ParsedOperationSecurityRequirement = Readonly<OpenAPISecurityRequirement>

/**
 * Response state used only by the generated HttpClient renderers.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedOperationHttpClientResponses {
  readonly successSchemas: ReadonlyMap<string, string>
  readonly errorSchemas: ReadonlyMap<string, string>
  readonly voidSuccessStatuses: ReadonlySet<string>
  readonly voidErrorStatuses: ReadonlySet<string>
  readonly sseSchema?: string
  readonly sseSchemaMode: "data" | "event"
  readonly binarySuccessStatuses: ReadonlySet<string>
}

/**
 * Normalized operation model shared by all OpenAPI generator backends.
 *
 * @category models
 * @since 4.0.0
 */
export interface ParsedOperation {
  readonly id: string
  readonly operationId: string | undefined
  readonly path: string
  readonly method: Lowercase<HttpMethod>
  readonly tags: ReadonlyArray<string>
  readonly metadata: ParsedOperationMetadata
  readonly parameters: {
    readonly path: ReadonlyArray<ParsedOperationParameter>
    readonly query: ReadonlyArray<ParsedOperationParameter>
    readonly header: ReadonlyArray<ParsedOperationParameter>
    readonly cookie: ReadonlyArray<ParsedOperationParameter>
  }
  readonly requestBody: ParsedOperationRequestBody | undefined
  readonly responses: ReadonlyArray<ParsedOperationResponse>
  readonly defaultResponse: ParsedOperationResponse | undefined
  readonly effectiveSecurity: ReadonlyArray<ParsedOperationSecurityRequirement>
  readonly description: string | undefined
  readonly params?: string
  readonly paramsOptional: boolean
  readonly urlParams: ReadonlyArray<string>
  readonly headers: ReadonlyArray<string>
  readonly cookies: ReadonlyArray<string>
  readonly payload?: string
  readonly payloadFormData: boolean
  readonly payloadFormUrlEncoded: boolean
  readonly pathSchema: string | undefined
  readonly querySchema: string | undefined
  readonly querySchemaOptional: boolean
  readonly headersSchema: string | undefined
  readonly headersSchemaOptional: boolean
  readonly requestBodyRepresentable: ReadonlyArray<ParsedOperationMediaTypeSchema>
  readonly pathIds: ReadonlyArray<string>
  readonly pathTemplate: string
  readonly httpClientResponses: ParsedOperationHttpClientResponses
}

/**
 * Creates a mutable operation accumulator populated with parser defaults.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeDeepMutable = (options: {
  readonly id: string
  readonly method: Lowercase<HttpMethod>
  readonly pathIds: Array<string>
  readonly pathTemplate: string
  readonly description: string | undefined
}): Types.DeepMutable<ParsedOperation> => ({
  ...options,
  operationId: undefined,
  path: "",
  tags: [],
  metadata: {
    summary: undefined,
    description: options.description,
    deprecated: false,
    externalDocs: undefined
  },
  parameters: {
    path: [],
    query: [],
    header: [],
    cookie: []
  },
  requestBody: undefined,
  responses: [],
  defaultResponse: undefined,
  effectiveSecurity: [],
  urlParams: [],
  headers: [],
  cookies: [],
  payloadFormData: false,
  payloadFormUrlEncoded: false,
  pathSchema: undefined,
  querySchema: undefined,
  querySchemaOptional: true,
  headersSchema: undefined,
  headersSchemaOptional: true,
  requestBodyRepresentable: [],
  httpClientResponses: {
    successSchemas: new Map(),
    errorSchemas: new Map(),
    voidSuccessStatuses: new Set(),
    voidErrorStatuses: new Set(),
    sseSchemaMode: "data",
    binarySuccessStatuses: new Set()
  },
  paramsOptional: true
})
