/**
 * The `OpenApiGenerator` module orchestrates converting OpenAPI and Swagger
 * documents into generated Effect source.
 *
 * It normalizes Swagger 2.0 input, resolves local references, builds the
 * parsed operation model, registers request and response schemas, applies
 * HttpApi-specific adaptations such as multipart helpers and security metadata,
 * emits warnings for unsupported or lossy OpenAPI features, and then delegates
 * final rendering to the HttpClient or HttpApi code generators.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type { OpenAPISecurityScheme, OpenAPISpec, OpenAPISpecOperation } from "effect/http-api/OpenApi"
import type { HttpMethod } from "effect/http/HttpMethod"
import * as JsonPointer from "effect/JsonPointer"
import type * as JsonSchema from "effect/JsonSchema"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import * as Rec from "effect/Record"
import * as String from "effect/String"
import SwaggerToOpenApi from "swagger2openapi"
import * as HttpApiTransformer from "./HttpApiTransformer.ts"
import * as JsonSchemaGenerator from "./JsonSchemaGenerator.ts"
import * as OpenApiTransformer from "./OpenApiTransformer.ts"
import * as ParsedOperation from "./ParsedOperation.ts"
import * as Utils from "./Utils.ts"

/**
 * Service for turning OpenAPI or Swagger specifications into generated Effect
 * HTTP client or HttpApi source code.
 *
 * @category services
 * @since 4.0.0
 */
export class OpenApiGenerator extends Context.Service<
  OpenApiGenerator,
  { readonly generate: (spec: OpenAPISpec, options: OpenApiGenerateOptions) => Effect.Effect<string> }
>()("OpenApiGenerator") {}

/**
 * Output targets supported by the OpenAPI generator.
 *
 * @category models
 * @since 4.0.0
 */
export type OpenApiGeneratorFormat = "httpclient" | "httpclient-type-only" | "httpapi"

/**
 * Stable identifiers for non-fatal OpenAPI generation warnings.
 *
 * @category models
 * @since 4.0.0
 */
export type OpenApiGeneratorWarningCode =
  | "cookie-parameter-dropped"
  | "additional-tags-dropped"
  | "sse-operation-skipped"
  | "response-headers-ignored"
  | "optional-request-body-approximated"
  | "default-response-remapped"
  | "security-and-downgraded"
  | "no-body-method-request-body-skipped"
  | "naming-collision"

/**
 * Describes a non-fatal issue encountered while mapping an OpenAPI operation to
 * generated Effect source.
 *
 * @category models
 * @since 4.0.0
 */
export interface OpenApiGeneratorWarning {
  readonly code: OpenApiGeneratorWarningCode
  readonly message: string
  readonly path?: string | undefined
  readonly method?: Lowercase<HttpMethod> | undefined
  readonly operationId?: string | undefined
}

/**
 * Options that control one OpenAPI generation run.
 *
 * @category options
 * @since 4.0.0
 */
export interface OpenApiGenerateOptions {
  /**
   * The name to give to the generated output.
   */
  readonly name: string
  /**
   * The output format to generate.
   */
  readonly format: OpenApiGeneratorFormat
  /**
   * Hook to transform each JSON Schema node before processing.
   */
  readonly onEnter?: ((js: JsonSchema.JsonSchema) => JsonSchema.JsonSchema) | undefined
  /**
   * Callback to receive non-fatal generation warnings.
   */
  readonly onWarning?: ((warning: OpenApiGeneratorWarning) => void) | undefined
}

interface HttpApiMultipartSchemaRefs {
  readonly kind: "httpapi"
  readonly singleFile: string
  readonly files: string
}

type MultipartSchemaRefs = HttpApiMultipartSchemaRefs | { readonly kind: "client"; readonly singleFile: string }

const methodNames: ReadonlyArray<Lowercase<HttpMethod>> = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
  "query"
]

/**
 * Constructs the OpenAPI generator service implementation.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.gen(function*() {
  const generate = Effect.fn(
    function*(spec: OpenAPISpec, options: OpenApiGenerateOptions) {
      const generator = JsonSchemaGenerator.make()
      const openApiTransformer = yield* OpenApiTransformer.OpenApiTransformer
      const emitWarning = makeWarningEmitter(options)

      if (isSwaggerSpec(spec)) {
        spec = yield* convertSwaggerSpec(spec)
      }

      function resolveRef(ref: string) {
        const parts = ref.split("/").slice(1).map(JsonPointer.unescapeToken)
        let current: any = spec
        for (const part of parts) {
          current = current[part]
        }
        return current
      }

      const multipart = makeMultipartSchemas(spec.components?.schemas ?? {}, options.format, resolveRef)

      const parsed = parseOpenApi(spec, generator, resolveRef, options.format, emitWarning, multipart.transform)

      // TODO: make a CLI option ?
      const importName = "Schema"
      const source = getDialect(spec)
      const schemaOptions = { onEnter: options.onEnter, multipartSchemaRefs: multipart.refs }
      const generation = options.format === "httpapi"
        ? generator.generateHttpApi(source, multipart.definitions, schemaOptions)
        : generator.generate(source, multipart.definitions, options.format === "httpclient-type-only", schemaOptions)

      if (options.format === "httpapi") {
        const needsMultipartImport = generation.includes("Multipart.")
        return String.stripMargin(
          `|${HttpApiTransformer.imports(importName, { multipart: needsMultipartImport })}
           |${generation}
           |${HttpApiTransformer.toImplementation(importName, options.name, parsed)}`
        )
      }

      return String.stripMargin(
        `|${openApiTransformer.imports(importName, parsed)}
         |${generation}
         |${openApiTransformer.toImplementation(importName, options.name, parsed)}
         |
         |${openApiTransformer.toTypes(importName, options.name, parsed)}`
      )
    },
    (effect, _, options) =>
      Effect.provideServiceEffect(
        effect,
        OpenApiTransformer.OpenApiTransformer,
        options.format === "httpclient-type-only"
          ? Effect.sync(OpenApiTransformer.makeTransformerTs)
          : Effect.sync(OpenApiTransformer.makeTransformerSchema)
      )
  )

  return { generate } as const
})

type WarningEmitter = (warning: OpenApiGeneratorWarning) => void

const makeWarningEmitter = (options: OpenApiGenerateOptions): WarningEmitter => (warning) => {
  options.onWarning?.(warning)
}

const parseOpenApi = (
  spec: OpenAPISpec,
  generator: ReturnType<typeof JsonSchemaGenerator.make>,
  resolveRef: (ref: string) => unknown,
  format: OpenApiGeneratorFormat,
  emitWarning: WarningEmitter,
  transformMultipart: (schema: JsonSchema.JsonSchema) => JsonSchema.JsonSchema
): ParsedOperation.ParsedOpenApi => {
  const operations: Array<ParsedOperation.ParsedOperation> = []
  const reservedSchemaNames = new Set<string>(Object.keys(spec.components?.schemas ?? {}))
  const isHttpApi = format === "httpapi"
  const securitySchemes = isHttpApi ? parseSecuritySchemes(spec, resolveRef) : []

  const addSchema = (
    baseName: string,
    schema: JsonSchema.JsonSchema,
    operation: ParsedOperation.ParsedOperation
  ): string => {
    let candidate = baseName
    let index = 2
    while (reservedSchemaNames.has(candidate)) {
      candidate = `${baseName}${index}`
      index += 1
    }
    if (candidate !== baseName) {
      warnForOperation(emitWarning, operation, {
        code: "naming-collision",
        message: `Schema name "${baseName}" collided with an existing name and was renamed to "${candidate}".`
      })
    }
    reservedSchemaNames.add(candidate)
    return generator.addSchema(candidate, schema)
  }

  for (const [path, methods] of Object.entries(spec.paths)) {
    const pathItem: Partial<Record<Lowercase<HttpMethod>, OpenAPISpecOperation>> = methods
    for (const method of methodNames) {
      const operation = method === "query"
        ? pathItem.query ?? methods["x-oai-additionalOperations"]?.QUERY
        : pathItem[method]
      if (Predicate.isUndefined(operation)) {
        continue
      }
      const id = operation.operationId
        ? Utils.camelize(operation.operationId)
        : `${method.toUpperCase()}${path}`

      const description = Utils.nonEmptyString(operation.description) ?? Utils.nonEmptyString(operation.summary)

      const { pathIds, pathTemplate } = processPath(path)

      const op = ParsedOperation.makeDeepMutable({
        id,
        method,
        description,
        pathIds,
        pathTemplate
      })
      const httpClientResponses = op.httpClientResponses
      op.path = path
      op.operationId = Utils.nonEmptyString(operation.operationId)
      op.tags = [...(operation.tags ?? [])]
      if (isHttpApi && op.tags.length > 1) {
        warnForOperation(emitWarning, op, {
          code: "additional-tags-dropped",
          message: `Additional tags (${op.tags.slice(1).join(", ")}) were dropped. Only the first tag ("${
            op.tags[0]
          }") is used for grouping.`
        })
      }
      op.metadata = {
        summary: Utils.nonEmptyString(operation.summary),
        description: Utils.nonEmptyString(operation.description),
        deprecated: operation.deprecated === true,
        externalDocs: operation.externalDocs
      }
      op.effectiveSecurity = cloneSecurityRequirements(operation.security ?? spec.security ?? [])
      if (isHttpApi) {
        warnForAndSecurityRequirements(emitWarning, op)
      }

      const schemaId = Utils.identifier(operation.operationId ?? path)

      const pathParameters = Array.isArray(methods.parameters)
        ? methods.parameters
        : undefined
      const parameters = resolveOperationParameters(
        pathParameters,
        Array.isArray(operation.parameters) ? operation.parameters : undefined,
        resolveRef
      )
      for (const parameter of parameters) {
        const parsedParameter: ParsedOperation.ParsedOperationParameter = {
          name: parameter.name,
          in: parameter.in,
          required: parameter.required === true,
          description: Utils.nonEmptyString(parameter.description),
          schema: parameter.schema
        }
        switch (parameter.in) {
          case "path": {
            op.parameters.path.push(parsedParameter)
            break
          }
          case "query": {
            op.parameters.query.push(parsedParameter)
            break
          }
          case "header": {
            op.parameters.header.push(parsedParameter)
            break
          }
          case "cookie": {
            op.parameters.cookie.push(parsedParameter)
            warnForOperation(emitWarning, op, {
              code: "cookie-parameter-dropped",
              message:
                `Cookie parameter "${parameter.name}" was dropped because non-security cookie parameters are not supported.`
            })
            break
          }
        }
      }

      const requestBody = resolveReference(operation.requestBody, resolveRef)
      if (isHttpApi && !methodSupportsRequestBody(op.method) && Predicate.isObject(requestBody)) {
        warnForOperation(emitWarning, op, {
          code: "no-body-method-request-body-skipped",
          message: `Operation was skipped because ${op.method.toUpperCase()} does not support request bodies.`
        })
        continue
      }

      const resolvedResponses = Object.entries(operation.responses ?? {}).map(
        ([status, response]) => [status, resolveReference(response, resolveRef)] as const
      )
      const hasExplicitSuccessResponse = resolvedResponses.some(([status]) => {
        if (!/^\d{3}$/.test(status)) {
          return false
        }
        return Number(status) < 400
      })

      if (isHttpApi && hasUnsupportedSuccessfulSseResponse(resolvedResponses, hasExplicitSuccessResponse)) {
        warnForOperation(emitWarning, op, {
          code: "sse-operation-skipped",
          message:
            "Operation was skipped because a successful SSE response is missing x-effect-stream metadata required for HttpApi generation."
        })
        continue
      }

      const validParameters = parameters.filter((parameter) => parameter.in !== "path" && parameter.in !== "cookie")

      const combinedParameterSchema = buildParameterSchema(validParameters, (parameter, added) => {
        if (parameter.in === "query") {
          Utils.spreadElementsInto(added, op.urlParams)
        } else if (parameter.in === "header") {
          Utils.spreadElementsInto(added, op.headers)
        } else if (parameter.in === "cookie") {
          Utils.spreadElementsInto(added, op.cookies)
        }
      })

      if (combinedParameterSchema !== undefined) {
        op.params = addSchema(`${schemaId}Params`, combinedParameterSchema.schema, op)
        op.paramsOptional = combinedParameterSchema.optional
      }

      if (isHttpApi) {
        const pathParameterSchema = buildParameterSchema(op.parameters.path)
        if (pathParameterSchema !== undefined) {
          op.pathSchema = addSchema(`${schemaId}PathParams`, pathParameterSchema.schema, op)
        }

        const queryParameterSchema = buildParameterSchema(op.parameters.query)
        if (queryParameterSchema !== undefined) {
          op.querySchema = addSchema(`${schemaId}Query`, queryParameterSchema.schema, op)
          op.querySchemaOptional = queryParameterSchema.optional
        }

        const headerParameterSchema = buildParameterSchema(op.parameters.header)
        if (headerParameterSchema !== undefined) {
          op.headersSchema = addSchema(`${schemaId}Headers`, headerParameterSchema.schema, op)
          op.headersSchemaOptional = headerParameterSchema.optional
        }
      }

      if (Predicate.isNotUndefined(requestBody) && Predicate.isObject(requestBody)) {
        const content = Predicate.isObject(requestBody.content)
          ? requestBody.content as Record<string, any>
          : {}
        const requestSchemaNames = new Map<string, string>()
        op.requestBody = {
          required: requestBody.required === true,
          contentTypes: Object.keys(content)
        }
        if (isHttpApi && requestBody.required === false) {
          warnForOperation(emitWarning, op, {
            code: "optional-request-body-approximated",
            message: "Optional request body was approximated by adding a no-content payload alternative."
          })
        }

        if (Predicate.isNotUndefined(content["application/json"]?.schema)) {
          op.payload = addSchema(`${schemaId}RequestJson`, content["application/json"].schema, op)
          requestSchemaNames.set("application/json", op.payload)
        }

        if (Predicate.isNotUndefined(content["multipart/form-data"]?.schema)) {
          op.payload = addSchema(
            `${schemaId}RequestFormData`,
            transformMultipart(content["multipart/form-data"].schema),
            op
          )
          op.payloadFormData = true
          requestSchemaNames.set("multipart/form-data", op.payload)
        }

        if (Predicate.isNotUndefined(content["application/x-www-form-urlencoded"]?.schema)) {
          op.payload = addSchema(
            `${schemaId}RequestFormUrlEncoded`,
            content["application/x-www-form-urlencoded"].schema,
            op
          )
          op.payloadFormUrlEncoded = true
          requestSchemaNames.set("application/x-www-form-urlencoded", op.payload)
        }

        if (isHttpApi) {
          const representableRequestBody: Array<ParsedOperation.ParsedOperationMediaTypeSchema> = []
          for (const [contentType, mediaType] of Object.entries(content)) {
            if (!Predicate.isObject(mediaType) || Predicate.isUndefined(mediaType.schema)) {
              continue
            }
            const encoding = getRequestMediaTypeEncoding(contentType)
            if (encoding === undefined) {
              continue
            }
            let schemaName = requestSchemaNames.get(contentType)
            if (schemaName === undefined) {
              const schema = encoding === "multipart"
                ? transformMultipart(mediaType.schema as JsonSchema.JsonSchema)
                : mediaType.schema as JsonSchema.JsonSchema
              schemaName = addSchema(
                `${schemaId}Request${mediaTypeToSuffix(contentType)}`,
                schema,
                op
              )
              requestSchemaNames.set(contentType, schemaName)
            }
            representableRequestBody.push({
              contentType,
              encoding,
              schema: schemaName
            })
          }
          op.requestBodyRepresentable = representableRequestBody
        }
      }

      let defaultSchema: string | undefined
      for (const [status, response] of resolvedResponses) {
        if (!Predicate.isObject(response)) {
          continue
        }

        const parsedStatus = isHttpApi
          ? remapDefaultResponseStatusForHttpApi(status, hasExplicitSuccessResponse)
          : status
        if (isHttpApi && status === "default") {
          warnForOperation(emitWarning, op, {
            code: "default-response-remapped",
            message: `Default response was remapped to status ${parsedStatus} for HttpApi generation.`
          })
        }

        const content = Predicate.isObject(response.content)
          ? response.content as Record<string, any>
          : undefined
        if (isHttpApi && Predicate.isNotUndefined(response.headers)) {
          warnForOperation(emitWarning, op, {
            code: "response-headers-ignored",
            message: `Response headers on status ${status} were ignored in HttpApi generation.`
          })
        }
        const representable: Array<ParsedOperation.ParsedOperationMediaTypeSchema> = []

        let jsonSchemaName: string | undefined
        let jsonResponseContentType: string | undefined
        if (isHttpApi) {
          const jsonResponseEntries = Object.entries(content ?? {}).filter(([contentType, mediaType]) =>
            isJsonMediaType(normalizeMediaType(contentType)) &&
            Predicate.isObject(mediaType) &&
            Predicate.isNotUndefined(mediaType.schema)
          )
          const jsonResponseEntry = jsonResponseEntries.find(([contentType]) =>
            normalizeMediaType(contentType) === "application/json"
          ) ?? jsonResponseEntries[0]
          if (Predicate.isNotUndefined(jsonResponseEntry)) {
            const [contentType, mediaType] = jsonResponseEntry
            jsonResponseContentType = contentType
            jsonSchemaName = addSchema(`${schemaId}${status}`, mediaType.schema as JsonSchema.JsonSchema, op)
            representable.push({
              contentType,
              encoding: "json",
              schema: jsonSchemaName
            })
          }
        } else {
          const jsonSchemas = Object.entries(content ?? {}).flatMap(([contentType, mediaType]) =>
            isJsonMediaType(normalizeMediaType(contentType)) &&
              Predicate.isObject(mediaType) &&
              Predicate.isNotUndefined(mediaType.schema)
              ? [mediaType.schema as JsonSchema.JsonSchema]
              : []
          )
          if (jsonSchemas.length > 0) {
            jsonSchemaName = addSchema(
              `${schemaId}${status}`,
              jsonSchemas.length === 1 ? jsonSchemas[0] : { anyOf: jsonSchemas },
              op
            )
          }
        }

        if (isHttpApi) {
          for (const [contentType, mediaType] of Object.entries(content ?? {})) {
            if (contentType === jsonResponseContentType) {
              continue
            }
            if (!Predicate.isObject(mediaType)) {
              continue
            }

            const streamEncoding = isSuccessStatus(parsedStatus)
              ? getEffectStreamEncoding(mediaType)
              : undefined
            if (streamEncoding === "uint8array") {
              representable.push({
                contentType,
                encoding: "binary",
                effectStream: "uint8array"
              })
              continue
            }
            if (streamEncoding === "sse") {
              const errorSchema = getEffectStreamErrorSchema(mediaType)
              if (Predicate.isUndefined(mediaType.schema) || Predicate.isUndefined(errorSchema)) {
                continue
              }
              representable.push({
                contentType,
                encoding: "text",
                effectStream: "sse",
                schema: addSchema(
                  `${schemaId}${status}Sse`,
                  mediaType.schema as JsonSchema.JsonSchema,
                  op
                ),
                errorSchema: addSchema(
                  `${schemaId}${status}SseError`,
                  errorSchema,
                  op
                )
              })
              continue
            }

            if (Predicate.isUndefined(mediaType.schema)) {
              continue
            }
            const encoding = getResponseMediaTypeEncoding(contentType)
            if (encoding === undefined) {
              continue
            }
            const schemaName = addSchema(
              `${schemaId}${status}${mediaTypeToSuffix(contentType)}`,
              mediaType.schema as JsonSchema.JsonSchema,
              op
            )
            representable.push({
              contentType,
              encoding,
              schema: schemaName
            })
          }
        }

        const isEmptyResponse = Predicate.isUndefined(content) || Object.keys(content).length === 0
        const parsedResponse = {
          status: parsedStatus,
          description: Utils.nonEmptyString(response.description),
          contentTypes: Predicate.isNotUndefined(content) ? Object.keys(content) : [],
          hasHeaders: Predicate.isNotUndefined(response.headers),
          isEmpty: isEmptyResponse,
          representable
        }
        op.responses.push(parsedResponse)
        if (status === "default") {
          op.defaultResponse = parsedResponse
        }

        const normalizedStatus = parsedStatus.toLowerCase()
        const hasBinaryResponse = Object.entries(content ?? {}).some(([contentType, mediaType]) =>
          Predicate.isObject(mediaType) &&
          (isBinaryMediaType(normalizeMediaType(contentType)) || isBinarySchema(mediaType.schema))
        )
        if (hasBinaryResponse && isSuccessStatus(parsedStatus)) {
          httpClientResponses.binarySuccessStatuses.add(normalizedStatus)
        }

        if (Predicate.isNotUndefined(jsonSchemaName)) {
          if (status === "default" && !isHttpApi) {
            defaultSchema = jsonSchemaName
            continue
          }

          if (Number.isNaN(Number(parsedStatus[0]))) {
            continue
          }
          if (isSuccessStatus(parsedStatus)) {
            if (!httpClientResponses.binarySuccessStatuses.has(normalizedStatus)) {
              httpClientResponses.successSchemas.set(normalizedStatus, jsonSchemaName)
            }
          } else {
            httpClientResponses.errorSchemas.set(normalizedStatus, jsonSchemaName)
          }
        }

        const sseMediaType = content?.["text/event-stream"]
        const sseResponseSchema = sseMediaType?.schema
        if (
          !isHttpApi && Predicate.isUndefined(httpClientResponses.sseSchema) &&
          Predicate.isNotUndefined(sseResponseSchema) &&
          isSuccessStatus(parsedStatus)
        ) {
          const effectStream = sseMediaType["x-effect-stream"]
          httpClientResponses.sseSchemaMode = getEffectStreamEncoding(sseMediaType) === "sse" ? "event" : "data"
          httpClientResponses.sseSchema = addSchema(
            `${schemaId}${status}Sse`,
            httpClientResponses.sseSchemaMode === "event"
              ? makeSseEventSchema(
                resolveReference(sseResponseSchema, resolveRef),
                effectStream?.encoding === "sse" ? effectStream.failureEvent : undefined
              )
              : sseResponseSchema,
            op
          )
        }

        if (isEmptyResponse && parsedStatus !== "default") {
          if (isSuccessStatus(normalizedStatus)) {
            httpClientResponses.voidSuccessStatuses.add(normalizedStatus)
          } else {
            httpClientResponses.voidErrorStatuses.add(normalizedStatus)
          }
        }
      }

      if (
        !isHttpApi && httpClientResponses.successSchemas.size === 0 && Predicate.isNotUndefined(defaultSchema)
      ) {
        httpClientResponses.successSchemas.set("2xx", defaultSchema)
        warnForOperation(emitWarning, op, {
          code: "default-response-remapped",
          message: "Default response was remapped to 2xx for the current HttpClient outputs."
        })
      }

      operations.push(op)
    }
  }

  return {
    metadata: {
      title: spec.info.title,
      version: spec.info.version,
      summary: Utils.nonEmptyString(spec.info.summary),
      description: Utils.nonEmptyString(spec.info.description),
      license: spec.info.license,
      servers: spec.servers
    },
    tags: (spec.tags ?? []).map((tag) => ({
      name: tag.name,
      description: Utils.nonEmptyString(tag.description),
      externalDocs: tag.externalDocs
    })),
    securitySchemes,
    operations
  }
}

interface OpenApiParameter {
  readonly name: string
  readonly in: "path" | "query" | "header" | "cookie"
  readonly required: boolean
  readonly schema: {}
  readonly description?: string | undefined
}

const isOpenApiParameter = (parameter: unknown): parameter is OpenApiParameter => {
  if (!Predicate.isObject(parameter)) {
    return false
  }
  return (
    typeof parameter.name === "string" &&
    (parameter.in === "path" || parameter.in === "query" || parameter.in === "header" || parameter.in === "cookie")
  )
}

const resolveOperationParameters = (
  pathParameters: ReadonlyArray<unknown> | undefined,
  operationParameters: ReadonlyArray<unknown> | undefined,
  resolveRef: (ref: string) => unknown
): Array<OpenApiParameter> => {
  const resolved = new Map<string, OpenApiParameter>()
  const add = (parameter: unknown): void => {
    const current = resolveReference(parameter, resolveRef)
    if (!isOpenApiParameter(current)) {
      return
    }

    const key = `${current.in}:${current.name}`
    if (resolved.has(key)) {
      resolved.delete(key)
    }
    resolved.set(key, current)
  }

  for (const parameter of pathParameters ?? []) {
    add(parameter)
  }

  for (const parameter of operationParameters ?? []) {
    add(parameter)
  }

  return [...resolved.values()]
}

const buildParameterSchema = <
  Parameter extends {
    readonly name: string
    readonly required: boolean
    readonly schema: {}
    readonly in?: "path" | "query" | "header" | "cookie" | undefined
  }
>(
  parameters: ReadonlyArray<Parameter>,
  onAdded?: ((parameter: Parameter, added: Array<string>) => void) | undefined
): {
  readonly schema: JsonSchema.JsonSchema
  readonly optional: boolean
} | undefined => {
  if (parameters.length === 0) {
    return
  }

  const schema = {
    type: "object" as JsonSchema.Type,
    properties: {} as Record<string, JsonSchema.JsonSchema>,
    required: [] as Array<string>,
    additionalProperties: false
  }

  for (const parameter of parameters) {
    const paramSchema = parameter.schema as any
    const added: Array<string> = []
    if (
      Predicate.isObject(paramSchema) &&
      "properties" in paramSchema &&
      Predicate.isObject(paramSchema.properties)
    ) {
      const required = "required" in paramSchema
        ? paramSchema.required as Array<string>
        : []

      for (const [name, propertySchema] of Object.entries(paramSchema.properties)) {
        const adjustedName = `${parameter.name}[${name}]`
        Rec.assignProperty(schema.properties, adjustedName, propertySchema as JsonSchema.JsonSchema)
        if (required.includes(name)) {
          schema.required.push(adjustedName)
        }
        added.push(adjustedName)
      }
    } else {
      Rec.assignProperty(schema.properties, parameter.name, parameter.schema as JsonSchema.JsonSchema)
      if (parameter.required) {
        schema.required.push(parameter.name)
      }
      added.push(parameter.name)
    }

    onAdded?.(parameter, added)
  }

  return {
    schema,
    optional: schema.required.length === 0
  }
}

const mediaTypeToSuffix = (contentType: string): string => {
  const normalized = contentType.toLowerCase()
  switch (normalized) {
    case "application/json":
      return "Json"
    case "multipart/form-data":
      return "FormData"
    case "application/x-www-form-urlencoded":
      return "FormUrlEncoded"
    case "text/plain":
      return "Text"
    case "application/octet-stream":
      return "Binary"
  }
  const suffix = Utils.identifier(contentType)
  return suffix.length > 0 ? suffix : "Body"
}

const makeMultipartSchemas = (
  definitions: JsonSchema.Definitions,
  format: OpenApiGeneratorFormat,
  resolveRef: (ref: string) => unknown
) => {
  const names = new Set(Object.keys(definitions))
  const allocate = (base: string): string => {
    let candidate = base
    let index = 2
    while (names.has(candidate)) {
      candidate = `${base}${index}`
      index += 1
    }
    names.add(candidate)
    return candidate
  }
  const output = { ...definitions }
  if (format === "httpapi") {
    const refs: HttpApiMultipartSchemaRefs = {
      kind: "httpapi",
      singleFile: allocate("__HttpApiMultipartSingleFile"),
      files: allocate("__HttpApiMultipartFiles")
    }
    const transform = (schema: JsonSchema.JsonSchema) => transformMultipartSchema(schema, refs, resolveRef)
    Rec.assignProperty(output, refs.singleFile, { type: "string", format: "binary" })
    for (const [name, schema] of Object.entries(definitions)) {
      Rec.assignProperty(output, name, transform(schema))
    }
    Rec.assignProperty(output, refs.files, { type: "array", items: { $ref: toDefinitionRef(refs.singleFile) } })
    return { refs, definitions: output, transform }
  }
  const refs: MultipartSchemaRefs = { kind: "client", singleFile: allocate("__ClientMultipartFile") }
  Rec.assignProperty(output, refs.singleFile, { type: "string", format: "binary" })
  // The client transform adds `*Multipart` copies to `output` while parsing, so render schemas after parseOpenApi.
  return {
    refs,
    definitions: output,
    transform: makeClientMultipartTransformer(output, refs.singleFile, allocate, resolveRef)
  }
}

const toDefinitionRef = (name: string): string => `#/$defs/${name.replaceAll("~", "~0").replaceAll("/", "~1")}`

const makeClientMultipartTransformer = (
  definitions: JsonSchema.Definitions,
  singleFile: string,
  allocate: (base: string) => string,
  resolveRef: (ref: string) => unknown
) => {
  const binaryComponents = new Map<string, boolean>()
  const copies = new Map<string, string>()

  const hasBinary = (value: unknown, seen: Set<string>): boolean => {
    if (Array.isArray(value)) return value.some((item) => hasBinary(item, seen))
    if (!Predicate.isObject(value)) return false
    if (isMultipartBinaryFile(value)) return true
    if (isComponentRef(value.$ref) && !seen.has(value.$ref)) {
      seen.add(value.$ref)
      if (hasBinary(resolveRef(value.$ref), seen)) return true
    }
    return Object.values(value).some((item) => hasBinary(item, seen))
  }

  const isBinaryComponent = ($ref: string): boolean => {
    let binary = binaryComponents.get($ref)
    if (binary === undefined) {
      binary = hasBinary(resolveRef($ref), new Set([$ref]))
      binaryComponents.set($ref, binary)
    }
    return binary
  }

  // Copies a binary-bearing component to `<Name>Multipart`, leaving the original for JSON payloads.
  const copyComponent = ($ref: string): string => {
    let name = copies.get($ref)
    if (name === undefined) {
      name = allocate(`${JsonPointer.unescapeToken($ref.slice(componentRefPrefix.length))}Multipart`)
      copies.set($ref, name)
      Rec.assignProperty(definitions, name, visit(resolveRef($ref)))
    }
    return name
  }

  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit)
    if (!Predicate.isObject(value)) return value
    if (isMultipartBinaryFile(value)) return { $ref: toDefinitionRef(singleFile) }
    const out = Rec.map(value, visit)
    if (isComponentRef(value.$ref) && isBinaryComponent(value.$ref)) {
      out.$ref = toDefinitionRef(copyComponent(value.$ref))
    }
    return out
  }

  return (schema: JsonSchema.JsonSchema) => visit(schema) as JsonSchema.JsonSchema
}

const componentRefPrefix = "#/components/schemas/"

const isComponentRef = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith(componentRefPrefix)

const transformMultipartSchema = (
  schema: JsonSchema.JsonSchema,
  multipartSchemaRefs: HttpApiMultipartSchemaRefs,
  resolveRef: (ref: string) => unknown
): JsonSchema.JsonSchema => {
  const singleFileRef = toDefinitionRef(multipartSchemaRefs.singleFile)
  const cache = new Map<string, unknown>()
  const stack = new Set<string>()

  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(visit)
    }
    if (!Predicate.isObject(value)) {
      return value
    }

    if (isComponentRef(value.$ref)) {
      const { $ref, ...siblings } = value
      const withSiblings = (schema: unknown): unknown =>
        Object.keys(siblings).length === 0 ? schema : { allOf: [schema, visit(siblings)] }
      const cached = cache.get($ref)
      if (cached !== undefined) {
        return withSiblings(cached)
      }
      if (stack.has($ref)) {
        return value
      }
      stack.add($ref)
      const transformed = visit(resolveRef($ref))
      stack.delete($ref)
      cache.set($ref, transformed)
      return withSiblings(transformed)
    }

    if (isMultipartBinaryFile(value)) {
      return { $ref: singleFileRef }
    }

    const out: Record<string, unknown> = {}
    for (const [key, current] of Object.entries(value)) {
      Rec.assignProperty(out, key, visit(current))
    }

    if (isMultipartBinaryFiles(out, singleFileRef)) {
      return { $ref: toDefinitionRef(multipartSchemaRefs.files) }
    }

    return out
  }

  return visit(schema) as JsonSchema.JsonSchema
}

const isMultipartBinaryFile = (value: unknown): boolean =>
  Predicate.isObject(value) &&
  value.type === "string" &&
  (
    (typeof value.format === "string" && value.format.toLowerCase() === "binary") ||
    (typeof value.contentEncoding === "string" && value.contentEncoding.toLowerCase() === "binary")
  )

const isMultipartBinaryFiles = (value: Record<string, unknown>, singleFileRef: string): boolean => {
  if (value.type !== "array") {
    return false
  }
  const items = value.items
  return isMultipartBinaryFile(items) || (Predicate.isObject(items) && items.$ref === singleFileRef)
}

const isJsonMediaType = (contentType: string): boolean =>
  contentType === "application/json" ||
  (contentType.startsWith("application/") && contentType.endsWith("+json"))

const normalizeMediaType = (contentType: string): string => contentType.toLowerCase().split(";", 1)[0].trim()

const isTextMediaType = (contentType: string): boolean => contentType.startsWith("text/")

const binaryMediaTypes = new Set([
  "application/octet-stream",
  "application/pdf",
  "application/zip",
  "application/gzip",
  "application/x-gzip",
  "application/x-tar",
  "application/x-zip-compressed"
])

const binaryMediaTypePrefixes = ["image/", "audio/", "video/", "font/"]

const isBinaryMediaType = (contentType: string): boolean =>
  binaryMediaTypes.has(contentType) ||
  binaryMediaTypePrefixes.some((prefix) => contentType.startsWith(prefix)) ||
  (contentType.startsWith("application/") &&
    (contentType.includes("binary") ||
      contentType.endsWith("+octet-stream") ||
      contentType.endsWith("+zip") ||
      contentType.endsWith("+gzip")))

const isBinarySchema = (schema: unknown): boolean =>
  Predicate.isObject(schema) &&
  (
    (typeof schema.format === "string" && schema.format.toLowerCase() === "binary") ||
    (typeof schema.contentEncoding === "string" && schema.contentEncoding.toLowerCase() === "binary")
  )

const isSuccessStatus = (status: string): boolean => {
  const statusMajorNumber = Number(status[0])
  return !Number.isNaN(statusMajorNumber) && statusMajorNumber < 4
}

const getRequestMediaTypeEncoding = (
  contentType: string
): ParsedOperation.ParsedOperationMediaTypeEncoding | undefined => {
  const normalized = normalizeMediaType(contentType)
  if (isJsonMediaType(normalized)) {
    return "json"
  }
  if (normalized === "multipart/form-data") {
    return "multipart"
  }
  if (normalized === "application/x-www-form-urlencoded") {
    return "form-url-encoded"
  }
  if (isTextMediaType(normalized)) {
    return "text"
  }
  if (isBinaryMediaType(normalized)) {
    return "binary"
  }
  return
}

const getResponseMediaTypeEncoding = (
  contentType: string
): ParsedOperation.ParsedOperationMediaTypeEncoding | undefined => {
  const normalized = normalizeMediaType(contentType)
  if (isJsonMediaType(normalized)) {
    return "json"
  }
  if (normalized === "application/x-www-form-urlencoded") {
    return "form-url-encoded"
  }
  if (isTextMediaType(normalized)) {
    return "text"
  }
  if (isBinaryMediaType(normalized)) {
    return "binary"
  }
  return
}

const getEffectStreamEncoding = (mediaType: object): "uint8array" | "sse" | undefined => {
  const stream = (mediaType as Record<string, unknown>)["x-effect-stream"]
  if (!Predicate.isObject(stream)) {
    return
  }
  return stream.encoding === "uint8array" || stream.encoding === "sse" ? stream.encoding : undefined
}

const getEffectStreamErrorSchema = (mediaType: object): JsonSchema.JsonSchema | undefined => {
  const stream = (mediaType as Record<string, unknown>)["x-effect-stream"]
  if (!Predicate.isObject(stream) || !Predicate.isObject(stream.errorSchema)) {
    return
  }
  return stream.errorSchema as JsonSchema.JsonSchema
}

const makeSseEventSchema = (
  input: JsonSchema.JsonSchema,
  failureEvent: string | undefined
): JsonSchema.JsonSchema => {
  const eventSchema = normalizeSseEventSchema(input)
  if (failureEvent === undefined) {
    return eventSchema
  }
  return {
    anyOf: [
      eventSchema,
      {
        type: "object",
        properties: {
          id: { type: "string" },
          event: { const: failureEvent },
          data: { type: "string" }
        },
        required: ["event", "data"],
        additionalProperties: false
      }
    ]
  }
}

const normalizeSseEventSchema = (input: JsonSchema.JsonSchema): JsonSchema.JsonSchema => {
  const schema = { ...input } as Record<string, any>
  for (const key of ["allOf", "anyOf", "oneOf"] as const) {
    if (Array.isArray(schema[key])) {
      schema[key] = schema[key].map(normalizeSseEventSchema)
    }
  }
  if (
    schema.type !== "object" ||
    !Predicate.isObject(schema.properties) ||
    !Object.hasOwn(schema.properties, "id") ||
    !Object.hasOwn(schema.properties, "event") ||
    !Object.hasOwn(schema.properties, "data")
  ) {
    return schema as JsonSchema.JsonSchema
  }

  // OpenAPI represents `undefined` as required nullable; restore the SSE parser's optional wire field.
  schema.properties = {
    ...schema.properties,
    id: { type: "string" }
  }
  if (Array.isArray(schema.required)) {
    schema.required = schema.required.filter((name: unknown) => name !== "id")
  }
  return schema as JsonSchema.JsonSchema
}

const resolveReference = (input: unknown, resolveRef: (ref: string) => unknown): any => {
  let current = input
  while (Predicate.isObject(current) && typeof current.$ref === "string") {
    current = resolveRef(current.$ref)
  }
  return current
}

const cloneSecurityRequirements = (
  security: ReadonlyArray<Record<string, ReadonlyArray<string>>>
): Array<ParsedOperation.ParsedOperationSecurityRequirement> =>
  security.map((requirement) =>
    Object.fromEntries(
      Object.entries(requirement).map(([name, scopes]) => [name, [...scopes]])
    )
  )

const parseSecuritySchemes = (
  spec: OpenAPISpec,
  resolveRef: (ref: string) => unknown
): Array<ParsedOperation.ParsedOpenApiSecurityScheme> => {
  const securitySchemes = spec.components?.securitySchemes ?? {}
  const parsed: Array<ParsedOperation.ParsedOpenApiSecurityScheme> = []

  for (const [name, value] of Object.entries(securitySchemes)) {
    const scheme = resolveReference(value, resolveRef) as OpenAPISecurityScheme | undefined
    if (!Predicate.isObject(scheme)) {
      continue
    }

    if (scheme.type === "http" && typeof scheme.scheme === "string") {
      const normalizedScheme = scheme.scheme.toLowerCase()
      if (normalizedScheme === "basic") {
        parsed.push({
          name,
          type: "basic",
          description: Utils.nonEmptyString(scheme.description),
          bearerFormat: undefined,
          scheme: undefined,
          key: undefined,
          in: undefined
        })
      } else if (normalizedScheme === "bearer") {
        parsed.push({
          name,
          type: "bearer",
          description: Utils.nonEmptyString(scheme.description),
          bearerFormat: Utils.nonEmptyString(scheme.bearerFormat),
          scheme: undefined,
          key: undefined,
          in: undefined
        })
      } else {
        parsed.push({
          name,
          type: "http",
          description: Utils.nonEmptyString(scheme.description),
          bearerFormat: Utils.nonEmptyString(scheme.bearerFormat),
          scheme: scheme.scheme,
          key: undefined,
          in: undefined
        })
      }
      continue
    }

    if (
      scheme.type === "apiKey" &&
      (scheme.in === "header" || scheme.in === "query" || scheme.in === "cookie") &&
      typeof scheme.name === "string"
    ) {
      parsed.push({
        name,
        type: "apiKey",
        description: Utils.nonEmptyString(scheme.description),
        bearerFormat: undefined,
        scheme: undefined,
        key: scheme.name,
        in: scheme.in
      })
    }
  }

  return parsed
}

const warnForAndSecurityRequirements = (
  emitWarning: WarningEmitter,
  operation: ParsedOperation.ParsedOperation
): void => {
  if (operation.effectiveSecurity.some((requirement) => Object.keys(requirement).length === 0)) {
    return
  }
  for (const requirement of operation.effectiveSecurity) {
    const schemes = Object.keys(requirement)
    if (schemes.length <= 1) {
      continue
    }
    warnForOperation(emitWarning, operation, {
      code: "security-and-downgraded",
      message: `Security requirement requiring all of [${
        schemes.join(", ")
      }] was downgraded to a placeholder middleware.`
    })
  }
}

const hasUnsupportedSuccessfulSseResponse = (
  responses: ReadonlyArray<readonly [string, unknown]>,
  hasExplicitSuccessResponse: boolean
): boolean => {
  for (const [status, response] of responses) {
    if (!Predicate.isObject(response)) {
      continue
    }
    const remappedStatus = remapDefaultResponseStatusForHttpApi(status, hasExplicitSuccessResponse)
    const statusCode = Number(remappedStatus)
    if (Number.isNaN(statusCode) || statusCode >= 400) {
      continue
    }

    const content = Predicate.isObject(response.content)
      ? response.content as Record<string, any>
      : undefined
    if (Predicate.isUndefined(content)) {
      continue
    }

    for (const [contentType, mediaType] of Object.entries(content)) {
      if (!Predicate.isObject(mediaType)) {
        continue
      }
      const streamEncoding = getEffectStreamEncoding(mediaType)
      if (streamEncoding === "sse") {
        if (Predicate.isUndefined(mediaType.schema) || Predicate.isUndefined(getEffectStreamErrorSchema(mediaType))) {
          return true
        }
        continue
      }
      if (contentType === "text/event-stream") {
        return true
      }
    }
  }
  return false
}

const remapDefaultResponseStatusForHttpApi = (status: string, hasExplicitSuccessResponse: boolean): string =>
  status === "default" ? (hasExplicitSuccessResponse ? "500" : "200") : status

const methodSupportsRequestBody = (method: Lowercase<HttpMethod>): boolean =>
  method !== "get" && method !== "head" && method !== "options" && method !== "trace"

const warnForOperation = (
  emitWarning: WarningEmitter,
  operation: ParsedOperation.ParsedOperation,
  warning: {
    readonly code: OpenApiGeneratorWarningCode
    readonly message: string
  }
): void => {
  emitWarning({
    ...warning,
    path: operation.path,
    method: operation.method,
    operationId: operation.operationId
  })
}

function getDialect(spec: OpenAPISpec): "openapi-3.0" | "openapi-3.1" {
  return spec.openapi.trim().startsWith("3.0") ? "openapi-3.0" : "openapi-3.1"
}

/**
 * Layer providing an OpenAPI generator for Schema-backed HTTP client and HttpApi output.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerTransformerSchema: Layer.Layer<OpenApiGenerator> = Layer.effect(OpenApiGenerator, make)

/**
 * Layer providing an OpenAPI generator for type-only HTTP client output.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerTransformerTs: Layer.Layer<OpenApiGenerator> = Layer.effect(OpenApiGenerator, make)

const isSwaggerSpec = (spec: OpenAPISpec) => "swagger" in spec

const convertSwaggerSpec = Effect.fn((spec: OpenAPISpec) =>
  Effect.callback<OpenAPISpec>((resume) => {
    SwaggerToOpenApi.convertObj(
      spec as any,
      { laxDefaults: true, laxurls: true, patch: true, warnOnly: true },
      (err, result) => {
        if (err) {
          resume(Effect.die(err))
        } else {
          resume(Effect.succeed(result.openapi as any))
        }
      }
    )
  }).pipe(Effect.withSpan("OpenApi.convertSwaggerSpec"))
)

const processPath = (path: string): {
  readonly pathIds: Array<string>
  readonly pathTemplate: string
} => {
  const pathIds: Array<string> = []
  const fragments: Array<string> = []
  let offset = 0
  for (const match of path.matchAll(/{([^}]+)}/g)) {
    fragments.push(JSON.stringify(path.slice(offset, match.index)))
    const id = Utils.camelize(match[1])
    pathIds.push(id)
    fragments.push(`__encodePathParam(${id})`)
    offset = match.index + match[0].length
  }
  fragments.push(JSON.stringify(path.slice(offset)))
  const pathTemplate = fragments.join(" + ")
  return { pathIds, pathTemplate } as const
}
