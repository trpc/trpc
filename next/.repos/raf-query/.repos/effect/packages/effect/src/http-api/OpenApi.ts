/**
 * Generates OpenAPI 3.1 documents from declarative `HttpApi` contracts.
 *
 * The generator reads API groups, endpoints, schemas, security definitions, and
 * annotations, then produces an OpenAPI document. This module also provides the
 * annotations used to shape that output and the TypeScript model for the
 * OpenAPI objects it generates.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import type { NonEmptyArray } from "../Array.ts"
import * as Context from "../Context.ts"
import * as Equal from "../Equal.ts"
import { constFalse } from "../Function.ts"
import * as HttpMethod from "../http/HttpMethod.ts"
import * as InternalRecord from "../internal/record.ts"
import * as InternalToCodec from "../internal/schema/toCodec.ts"
import * as InternalToJsonSchemaDocument from "../internal/schema/toJsonSchemaDocument.ts"
import * as InternalToRepresentation from "../internal/schema/toRepresentation.ts"
import * as JsonSchema from "../JsonSchema.ts"
import * as Option from "../Option.ts"
import * as Schema from "../Schema.ts"
import * as SchemaAST from "../SchemaAST.ts"
import type * as SchemaRepresentation from "../SchemaRepresentation.ts"
import * as HttpApi from "./HttpApi.ts"
import * as HttpApiEndpoint from "./HttpApiEndpoint.ts"
import type * as HttpApiGroup from "./HttpApiGroup.ts"
import * as HttpApiMiddleware from "./HttpApiMiddleware.ts"
import * as HttpApiSchema from "./HttpApiSchema.ts"
import type { HttpApiSecurity } from "./HttpApiSecurity.ts"
import * as HttpApiPath from "./internal/path.ts"

/**
 * OpenAPI annotation for overriding generated identifiers, including operation ids.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Identifier extends Context.Service<Identifier, string>()("effect/http-api/OpenApi/Identifier") {}

/**
 * OpenAPI annotation for setting the API title or group tag name.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Title extends Context.Service<Title, string>()("effect/http-api/OpenApi/Title") {}

/**
 * OpenAPI annotation for setting the generated API version.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Version extends Context.Service<Version, string>()("effect/http-api/OpenApi/Version") {}

/**
 * OpenAPI annotation for setting generated descriptions on APIs, groups, endpoints, or security schemes.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Description extends Context.Service<Description, string>()("effect/http-api/OpenApi/Description") {}

/**
 * OpenAPI annotation for setting the generated API license metadata.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class License extends Context.Service<License, OpenAPISpecLicense>()("effect/http-api/OpenApi/License") {}

/**
 * OpenAPI annotation for adding external documentation metadata to groups or endpoints.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class ExternalDocs
  extends Context.Service<ExternalDocs, OpenAPISpecExternalDocs>()("effect/http-api/OpenApi/ExternalDocs")
{}

/**
 * OpenAPI annotation for setting the generated API server list.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Servers
  extends Context.Service<Servers, ReadonlyArray<OpenAPISpecServer>>()("effect/http-api/OpenApi/Servers")
{}

/**
 * OpenAPI annotation for setting the format metadata, such as a bearer token format on security schemes.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Format extends Context.Service<Format, string>()("effect/http-api/OpenApi/Format") {}

/**
 * OpenAPI annotation for setting generated summary text.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Summary extends Context.Service<Summary, string>()("effect/http-api/OpenApi/Summary") {}

/**
 * OpenAPI annotation for marking a generated endpoint operation as deprecated.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Deprecated extends Context.Service<Deprecated, boolean>()("effect/http-api/OpenApi/Deprecated") {}

/**
 * OpenAPI annotation for shallowly merging additional fields into a generated OpenAPI object.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Override
  extends Context.Service<Override, Record<string, unknown>>()("effect/http-api/OpenApi/Override")
{}

/**
 * Annotation that excludes an annotated group or endpoint from the generated
 * OpenAPI specification.
 *
 * **When to use**
 *
 * Use to hide internal, experimental, or otherwise undocumented HTTP API groups
 * and endpoints from generated OpenAPI output.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Exclude = Context.Reference<boolean>("effect/http-api/OpenApi/Exclude", {
  defaultValue: constFalse
})

/**
 * OpenAPI annotation for transforming a generated OpenAPI object.
 *
 * **Details**
 *
 * The function is applied during generation to the annotated API, group tag, or
 * endpoint operation.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Transform extends Context.Service<
  Transform,
  (openApiSpec: Record<string, any>) => Record<string, any>
>()("effect/http-api/OpenApi/Transform") {}

const servicesPartial = <Tags extends Record<string, Context.Key<any, any> | Context.Key<never, any>>>(
  tags: Tags
): (
  options: {
    readonly [K in keyof Tags]?: Context.Service.Shape<Tags[K]> | undefined
  }
) => Context.Context<never> => {
  const entries = Object.entries(tags)
  return (options) => {
    let context = Context.empty()
    for (const [key, tag] of entries) {
      if (options[key] !== undefined) {
        context = Context.add(context, tag as any, options[key]!)
      }
    }
    return context
  }
}

/**
 * Builds a `Context` containing OpenAPI annotations from the supplied options.
 *
 * @stability unstable
 * @category annotations
 * @since 4.0.0
 */
export const annotations: (
  options: {
    readonly identifier?: string | undefined
    readonly title?: string | undefined
    readonly version?: string | undefined
    readonly description?: string | undefined
    readonly license?: OpenAPISpecLicense | undefined
    readonly summary?: string | undefined
    readonly deprecated?: boolean | undefined
    readonly externalDocs?: OpenAPISpecExternalDocs | undefined
    readonly servers?: ReadonlyArray<OpenAPISpecServer> | undefined
    readonly format?: string | undefined
    readonly override?: Record<string, unknown> | undefined
    readonly exclude?: boolean | undefined
    readonly transform?: ((openApiSpec: Record<string, any>) => Record<string, any>) | undefined
  }
) => Context.Context<never> = servicesPartial({
  identifier: Identifier,
  title: Title,
  version: Version,
  description: Description,
  license: License,
  summary: Summary,
  deprecated: Deprecated,
  externalDocs: ExternalDocs,
  servers: Servers,
  format: Format,
  override: Override,
  exclude: Exclude,
  transform: Transform
})

const defaultOptions: SchemaRepresentation.ToRepresentationOptions = {}
const apiCache = new WeakMap<
  SchemaRepresentation.ToRepresentationOptions,
  WeakMap<HttpApi.Constraint, OpenAPISpec>
>()

const cloneOpenAPISpec = <A>(value: A): A => {
  if (Array.isArray(value)) {
    return value.map(cloneOpenAPISpec) as A
  }
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      InternalRecord.assignProperty(out, key, cloneOpenAPISpec((value as Record<string, unknown>)[key]))
    }
    return out as A
  }
  return value
}

/**
 * This function checks if a given tag exists within the provided context. If
 * the tag is present, it retrieves the associated value and applies the given
 * callback function to it. If the tag is not found, the function does nothing.
 */
function processAnnotation<Services, S, I>(
  ctx: Context.Context<Services>,
  annotation: Context.Key<I, S>,
  f: (s: S) => void
) {
  const o = Context.getOption(ctx, annotation)
  if (Option.isSome(o)) {
    f(o.value)
  }
}

/**
 * Generates an OpenAPI 3.1 specification from an `HttpApi`.
 *
 * **When to use**
 *
 * Use when you need a programmatic OpenAPI document for an API definition.
 *
 * **Details**
 *
 * This function takes an `HttpApi` instance, which defines a structured API,
 * and generates an OpenAPI Specification (`OpenAPISpec`). The resulting spec
 * adheres to the OpenAPI 3.1.0 standard and includes detailed metadata such as
 * paths, operations, security schemes, and components. The function processes
 * the API's annotations, middleware, groups, and endpoints to build a complete
 * and accurate representation of the API in OpenAPI format.
 *
 * The function also deduplicates schemas, applies transformations, and
 * integrates annotations like descriptions, summaries, external documentation,
 * and overrides. The optional reference policy receives canonical JSON encoded
 * ASTs and controls which schemas are extracted into components. By default, only candidates with resolved identifiers
 * become references; anonymous non-recursive schemas remain inline.
 *
 * **Gotchas**
 *
 * Cached results are keyed by both the `HttpApi` instance and the identity of the options object. Reuse the same immutable
 * options object to reuse a cached result; mutating an options object after its first use does not invalidate the cached
 * specification. Each call returns a copy of the cached specification.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function fromApi<Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
  options?: SchemaRepresentation.ToRepresentationOptions
): OpenAPISpec {
  const resolvedOptions = options ?? defaultOptions
  let cache = apiCache.get(resolvedOptions)
  if (cache === undefined) {
    cache = new WeakMap()
    apiCache.set(resolvedOptions, cache)
  }
  const cached = cache.get(api)
  if (cached !== undefined) return cloneOpenAPISpec(cached)
  const spec = makeOpenApi(api, resolvedOptions)
  cache.set(api, cloneOpenAPISpec(spec))
  return spec
}

type SchemaOp =
  | {
    readonly _tag: "schema"
    readonly ast: SchemaAST.AST
    readonly target: JsonSchema.JsonSchema
  }
  | {
    readonly _tag: "properties"
    readonly ast: SchemaAST.AST
    readonly select?: ((property: SchemaRepresentation.PropertySignature) => boolean) | undefined
    readonly apply: (property: SchemaRepresentation.PropertySignature, schema: JsonSchema.JsonSchema) => void
  }

function makeOpenApi<Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
  options: SchemaRepresentation.ToRepresentationOptions
): OpenAPISpec {
  let spec: OpenAPISpec = {
    openapi: "3.1.0",
    info: {
      title: "Api",
      version: "0.0.1"
    },
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {}
    },
    security: [],
    tags: []
  }

  const schemaOps: Array<SchemaOp> = []
  const pathOperations = new Set<string>()
  const operationIds = new Set<string>()
  const finalizeOperations: Array<() => void> = []

  function registerSchema(
    ast: SchemaAST.AST,
    encoding: HttpApiSchema.Encoding["_tag"] = "Json"
  ): JsonSchema.JsonSchema {
    // Text bodies remain strings even when an opaque schema compiles to {}.
    const target: JsonSchema.JsonSchema = encoding === "Text" ? { type: "string" } : {}
    schemaOps.push({ _tag: "schema", ast: toEncodingAST(ast, encoding), target })
    return target
  }

  processAnnotation(api.annotations, Title, (title) => {
    spec.info.title = title
  })
  processAnnotation(api.annotations, Version, (version) => {
    spec.info.version = version
  })
  processAnnotation(api.annotations, Description, (description) => {
    spec.info.description = description
  })
  processAnnotation(api.annotations, License, (license) => {
    spec.info.license = license
  })
  processAnnotation(api.annotations, Summary, (summary) => {
    spec.info.summary = summary
  })
  processAnnotation(api.annotations, Servers, (servers) => {
    spec.servers = [...servers]
  })

  HttpApi.reflect(api, {
    onGroup({ group }) {
      if (Context.get(group.annotations, Exclude)) {
        return
      }
      let tag: OpenAPISpecTag = {
        name: Context.getOrElse(group.annotations, Title, () => group.identifier)
      }
      processAnnotation(group.annotations, Description, (description) => {
        tag.description = description
      })
      processAnnotation(group.annotations, ExternalDocs, (externalDocs) => {
        tag.externalDocs = externalDocs
      })
      processAnnotation(group.annotations, Override, (override) => {
        // OpenAPI documents are JSON, so symbol keys are intentionally ignored.
        for (const [key, value] of Object.entries(override)) {
          InternalRecord.assignProperty(tag as any, key, value)
        }
      })
      processAnnotation(group.annotations, Transform, (transformFn) => {
        tag = transformFn(tag) as OpenAPISpecTag
      })

      spec.tags.push(tag)
    },
    onEndpoint({ endpoint, group, mergedAnnotations, middleware }) {
      if (Context.get(mergedAnnotations, Exclude)) {
        return
      }
      const op: OpenAPISpecOperation = {
        tags: [Context.getOrElse(group.annotations, Title, () => group.identifier)],
        operationId: Context.getOrElse(
          endpoint.annotations,
          Identifier,
          () => group.topLevel ? endpoint.identifier : `${group.identifier}.${endpoint.identifier}`
        ),
        parameters: [],
        security: [],
        responses: {}
      }

      const paramNames = HttpApiPath.getParamNames(endpoint.params)
      const path = endpoint.path.replace(
        /:(\w+)\??/g,
        (match, key: string) => paramNames === undefined || paramNames.has(key) ? `{${key}}` : match
      )
      const method = endpoint.method.toLowerCase() as Lowercase<HttpMethod.HttpMethod>
      const isQuery = method === "query"
      const operationKey = isQuery ? "QUERY" : method

      function processResponseBodies(bodies: ResponseBodies, defaultDescription: () => string) {
        for (const [status, { content, descriptions, headers, streamContent }] of bodies) {
          const description = descriptions.size > 0 ? Array.from(descriptions).join(" | ") : defaultDescription()
          InternalRecord.assignProperty(op.responses, status, {
            description
          })
          for (const schema of headers) {
            schemaOps.push({
              _tag: "properties",
              ast: schema.ast,
              select: (property) => String(property.name).toLowerCase() !== "content-type",
              apply(property, schema) {
                const name = String(property.name).toLowerCase()
                op.responses[status].headers ??= {}
                InternalRecord.assignProperty(op.responses[status].headers, name, {
                  schema,
                  required: !property.isOptional
                })
              }
            })
          }
          if (content !== undefined) {
            content.forEach((map, encoding) => {
              map.forEach((schemas, contentType) => {
                const asts = Array.from(schemas, SchemaAST.getAST)
                const ast = asts.length === 1 ? asts[0] : new SchemaAST.Union(asts)
                op.responses[status].content ??= {}
                InternalRecord.assignProperty(op.responses[status].content, contentType, {
                  schema: registerSchema(ast, encoding)
                })
              })
            })
          }
          if (streamContent !== undefined) {
            streamContent.forEach((stream, contentType) => {
              op.responses[status].content ??= {}
              if (HttpApiSchema.isStreamSse(stream)) {
                InternalRecord.assignProperty(op.responses[status].content, contentType, {
                  schema: registerSchema(stream.events.ast),
                  "x-effect-stream": {
                    encoding: "sse",
                    causeSchema: registerSchema(Schema.Cause(stream.error, Schema.Defect()).ast),
                    errorSchema: registerSchema(stream.error.ast),
                    failureEvent: reservedStreamFailureEvent
                  }
                })
              } else {
                InternalRecord.assignProperty(op.responses[status].content, contentType, {
                  schema: {
                    type: "string",
                    format: "binary"
                  },
                  "x-effect-stream": {
                    encoding: "uint8array"
                  }
                })
              }
            })
          }
        }
      }

      function processParameters(schema: Schema.Constraint | undefined, i: OpenAPISpecParameter["in"]) {
        if (schema) {
          schemaOps.push({
            _tag: "properties",
            ast: schema.ast,
            apply(property, schema) {
              op.parameters.push({
                name: String(property.name),
                in: i,
                schema,
                required: i === "path" || !property.isOptional
              })
            }
          })
        }
      }

      processAnnotation(endpoint.annotations, Description, (description) => {
        op.description = description
      })
      processAnnotation(endpoint.annotations, Summary, (summary) => {
        op.summary = summary
      })
      processAnnotation(endpoint.annotations, Deprecated, (deprecated) => {
        op.deprecated = deprecated
      })
      processAnnotation(endpoint.annotations, ExternalDocs, (externalDocs) => {
        op.externalDocs = externalDocs
      })

      middleware.forEach((middleware) => {
        if (!HttpApiMiddleware.isSecurity(middleware)) {
          return
        }
        for (const [name, security] of Object.entries(middleware.security)) {
          processHttpApiSecurity(name, security)
          op.security.push({ [name]: [] })
        }
      })

      function processHttpApiSecurity(
        name: string,
        security: HttpApiSecurity
      ) {
        const scheme = makeSecurityScheme(security)
        if (!Object.hasOwn(spec.components.securitySchemes, name)) {
          InternalRecord.assignProperty(spec.components.securitySchemes, name, scheme)
          return
        }
        if (
          !Equal.equals(
            securitySchemeForComparison(spec.components.securitySchemes[name]),
            securitySchemeForComparison(scheme)
          )
        ) {
          throw new globalThis.Error(`Conflicting OpenAPI security scheme: ${name}`)
        }
      }

      const hasBody = HttpMethod.hasBody(endpoint.method)
      if (hasBody) {
        const schemasByContentType = new Map<string, {
          readonly encoding: HttpApiSchema.PayloadEncoding
          readonly schemas: Array<Schema.Top>
        }>()
        for (const schema of HttpApiEndpoint.getPayloadSchemas(endpoint)) {
          if (HttpApiSchema.isNoContent(schema.ast)) continue
          const encoding = HttpApiSchema.getPayloadEncoding(schema.ast, endpoint.method)
          const existing = schemasByContentType.get(encoding.contentType)
          if (existing === undefined) {
            schemasByContentType.set(encoding.contentType, { encoding, schemas: [schema] })
          } else {
            existing.schemas.push(schema)
          }
        }
        if (schemasByContentType.size > 0) {
          const content: OpenApiSpecContent = {}
          for (const [contentType, { encoding, schemas }] of schemasByContentType) {
            const asts = schemas.map(SchemaAST.getAST)
            const ast = asts.length === 1 ? asts[0] : new SchemaAST.Union(asts)
            InternalRecord.assignProperty(content, contentType, {
              schema: registerSchema(ast, encoding._tag)
            })
          }
          op.requestBody = { content, required: true }
        }
      }

      processParameters(endpoint.params, "path")
      if (!hasBody && endpoint.payload.size === 1) {
        const entry = endpoint.payload.values().next().value!
        processParameters(entry.schemas[0], "query")
      }
      processParameters(endpoint.headers, "header")
      processParameters(endpoint.query, "query")

      processResponseBodies(
        extractSuccessResponseBodies(endpoint),
        () => "Success"
      )
      processResponseBodies(
        extractResponseBodies(
          HttpApiEndpoint.getErrorSchemas(endpoint),
          HttpApiSchema.getStatusErrorSchema,
          resolveDescriptionOrIdentifier
        ),
        () => "Error"
      )

      const pathOperation = `${method} ${path.replace(/\{[^}]+\}/g, "{}")}`
      if (pathOperations.has(pathOperation)) {
        throw new globalThis.Error(`Duplicate OpenAPI operation for ${endpoint.method} ${path}`)
      }
      pathOperations.add(pathOperation)
      if (!Object.hasOwn(spec.paths, path)) {
        InternalRecord.assignProperty(spec.paths, path, {})
      }
      const getOperations = (): Partial<Record<OpenAPISpecMethodName | "QUERY", OpenAPISpecOperation>> => {
        const pathItem = spec.paths[path]
        return isQuery ? (pathItem["x-oai-additionalOperations"] ??= {}) : pathItem
      }
      getOperations()[operationKey] = op
      finalizeOperations.push(() => {
        const operations = getOperations()
        let op = operations[operationKey]!
        processAnnotation(endpoint.annotations, Override, (override) => {
          // OpenAPI documents are JSON, so symbol keys are intentionally ignored.
          for (const [key, value] of Object.entries(override)) {
            InternalRecord.assignProperty(op as any, key, value)
          }
        })
        processAnnotation(endpoint.annotations, Transform, (transformFn) => {
          op = transformFn(op) as OpenAPISpecOperation
        })
        const operationId = op.operationId
        if (operationId !== undefined) {
          if (operationIds.has(operationId)) {
            throw new globalThis.Error(`Duplicate OpenAPI operationId: ${operationId}`)
          }
          operationIds.add(operationId)
        }
        operations[operationKey] = op
      })
    }
  })

  processAnnotation(api.annotations, HttpApi.AdditionalSchemas, (componentSchemas) => {
    componentSchemas.forEach((componentSchema) => {
      const identifier = SchemaAST.resolveIdentifier(componentSchema.ast)
      if (identifier !== undefined) {
        if (Object.hasOwn(spec.components.schemas, identifier)) {
          throw new globalThis.Error(`Duplicate component schema identifier: ${identifier}`)
        }
        InternalRecord.assignProperty(spec.components.schemas, identifier, registerSchema(componentSchema.ast))
      }
    })
  })

  compileSchemaOps(schemaOps, options, spec.components.schemas)

  for (const finalize of finalizeOperations) {
    finalize()
  }

  Object.keys(spec.components.schemas).forEach((key) => {
    if (!JsonSchema.VALID_OPEN_API_COMPONENTS_SCHEMAS_KEY_REGEXP.test(key)) {
      throw new globalThis.Error(`Invalid component schema key: ${key}`)
    }
  })

  processAnnotation(api.annotations, Override, (override) => {
    // OpenAPI documents are JSON, so symbol keys are intentionally ignored.
    for (const [key, value] of Object.entries(override)) {
      InternalRecord.assignProperty(spec as any, key, value)
    }
  })
  processAnnotation(api.annotations, Transform, (transformFn) => {
    spec = transformFn(spec) as OpenAPISpec
  })

  return spec
}

function compileSchemaOps(
  schemaOps: Array<SchemaOp>,
  options: SchemaRepresentation.ToRepresentationOptions,
  components: JsonSchema.Definitions
): void {
  if (!Arr.isArrayNonEmpty(schemaOps)) return

  const document = InternalToRepresentation.toRepresentations(
    Arr.map(schemaOps, (op) => op.ast),
    options
  )
  const representations = Arr.map(document.representations, (representation, index) => {
    const op = schemaOps[index]
    return op._tag === "schema"
      ? representation
      : makePropertiesRepresentation(representation, document.references, op.select)
  })
  const references = selectReferences(representations, document.references)
  const jsonSchemaMultiDocument = JsonSchema.toMultiDocumentOpenApi3_1(
    InternalToJsonSchemaDocument.toJsonSchemaMultiDocument(
      { representations, references },
      { onExcessProperty: "error" }
    )
  )

  for (let index = 0; index < schemaOps.length; index++) {
    const op = schemaOps[index]
    const schema = jsonSchemaMultiDocument.schemas[index]
    if (op._tag === "schema") {
      InternalRecord.assignProperties(op.target, schema)
      continue
    }
    const representation = representations[index]
    if (representation._tag !== "Objects") {
      throw new globalThis.Error("Expected an object representation for HTTP properties")
    }
    // These schemas come from the synthetic Objects below, without root checks or annotations.
    const properties = schema.properties as Record<string, JsonSchema.JsonSchema>
    for (const property of representation.propertySignatures) {
      op.apply(property, properties[String(property.name)])
    }
  }

  for (const [name, definition] of Object.entries(jsonSchemaMultiDocument.definitions)) {
    InternalRecord.assignProperty(components, name, definition)
  }
}

function makePropertiesRepresentation(
  representation: SchemaRepresentation.Representation,
  references: SchemaRepresentation.References,
  select: ((property: SchemaRepresentation.PropertySignature) => boolean) | undefined
): SchemaRepresentation.Objects {
  const resolved = resolveRepresentation(representation, references)
  return {
    _tag: "Objects",
    propertySignatures: resolved._tag === "Objects"
      ? resolved.propertySignatures
        .filter((property) => select?.(property) ?? true)
        .map((property) => ({
          ...property,
          name: String(property.name)
        }))
      : [],
    indexSignatures: [],
    checks: []
  }
}

function resolveRepresentation(
  representation: SchemaRepresentation.Representation,
  references: SchemaRepresentation.References,
  seen = new Set<string>()
): SchemaRepresentation.Representation {
  if (representation._tag === "Suspend") {
    return resolveRepresentation(representation.thunk, references, seen)
  }
  if (representation._tag !== "Reference" || seen.has(representation.$ref)) return representation
  const target = references[representation.$ref]
  return target === undefined
    ? representation
    : resolveRepresentation(target, references, new Set(seen).add(representation.$ref))
}

function selectReferences(
  representations: ReadonlyArray<SchemaRepresentation.Representation>,
  references: SchemaRepresentation.References
): SchemaRepresentation.References {
  // The JSON Schema compiler emits every supplied reference. Keep only references reachable from the projected
  // roots so named parameter containers and excluded properties do not leak into OpenAPI components.
  const selected: Record<string, SchemaRepresentation.Representation> = {}
  const visited = new WeakSet<object>()
  const stack = [...representations]

  function pushChecks(checks: ReadonlyArray<SchemaRepresentation.Check>): void {
    for (const check of checks) {
      if (check.representation?.schemas !== undefined) stack.push(...check.representation.schemas)
      if (check._tag === "FilterGroup") pushChecks(check.checks)
    }
  }

  while (stack.length > 0) {
    const representation = stack.pop()!
    if (visited.has(representation)) continue
    visited.add(representation)
    if (representation._tag === "Reference") {
      if (Object.hasOwn(selected, representation.$ref)) continue
      const target = references[representation.$ref]
      if (target === undefined) continue
      InternalRecord.assignProperty(selected, representation.$ref, target)
      stack.push(target)
      continue
    }

    pushChecks(representation.checks)
    switch (representation._tag) {
      case "Declaration":
        stack.push(...representation.typeParameters)
        break
      case "Suspend":
        stack.push(representation.thunk)
        break
      case "TemplateLiteral":
        stack.push(...representation.parts)
        break
      case "Arrays":
        for (const element of representation.elements) stack.push(element.type)
        stack.push(...representation.rest)
        break
      case "Objects":
        for (const property of representation.propertySignatures) stack.push(property.type)
        for (const signature of representation.indexSignatures) {
          stack.push(signature.parameter, signature.type)
        }
        break
      case "Union":
        stack.push(...representation.types)
        break
    }
  }
  return selected
}

type ResponseBodies = Map<
  number, // status
  {
    descriptions: Set<string>
    content: Content | undefined // undefined means no content
    headers: Array<Schema.Constraint>
    streamContent: StreamContent | undefined
  }
>

const reservedStreamFailureEvent = "effect/http-api/stream/failure"

function extractSuccessResponseBodies(endpoint: HttpApiEndpoint.Top): ResponseBodies {
  return extractResponseBodies(
    HttpApiEndpoint.getSuccessSchemas(endpoint),
    HttpApiSchema.getStatusSuccessSchema,
    resolveDescriptionOrIdentifier
  )
}

function extractResponseBodies(
  schemas: Array<Schema.Constraint>,
  getStatus: (schema: Schema.Constraint) => number,
  getDescription: (ast: SchemaAST.AST) => string | undefined
): ResponseBodies {
  const map = new Map<number, {
    descriptions: Set<string>
    content: Content | undefined
    headers: Array<Schema.Constraint>
    streamContent: StreamContent | undefined
  }>()

  schemas.forEach(process)

  return map

  function process(schema: Schema.Constraint) {
    const annotation = HttpApiSchema.getWithHeadersAnnotation(schema.ast)
    const body = HttpApiSchema.isWithHeaders(schema) ? schema.schema : annotation?.body ?? schema
    const headers = HttpApiSchema.isWithHeaders(schema) ? schema.headers : annotation?.headersCodec
    const status = getStatus(schema)
    const ast = body.ast
    if (HttpApiSchema.isStreamSchema(body)) {
      addStreamContent(body, status)
    } else if (HttpApiSchema.isNoContent(ast)) {
      addNoContent(status, getDescription(schema.ast) ?? getDescription(ast) ?? "<No Content>")
    } else {
      addContent(
        body,
        status,
        HttpApiSchema.getResponseEncodingSchema(schema),
        getDescription(schema.ast) ?? getDescription(ast)
      )
    }
    if (headers !== undefined) {
      map.get(status)!.headers.push(headers)
    }
  }

  function addNoContent(status: number, description: string) {
    const statusMap = map.get(status)
    if (statusMap === undefined) {
      map.set(status, {
        descriptions: new Set([description]),
        content: undefined,
        headers: [],
        streamContent: undefined
      })
    } else {
      if (description !== undefined) {
        statusMap.descriptions.add(description)
      }
    }
  }

  function addContent(
    schema: Schema.Constraint,
    status: number,
    encoding: HttpApiSchema.Encoding,
    description: string | undefined
  ) {
    const statusMap = map.get(status)
    const { _tag, contentType } = encoding
    if (statusMap === undefined) {
      map.set(status, {
        descriptions: new Set(description !== undefined ? [description] : []),
        content: new Map([[_tag, new Map([[contentType, new Set([schema])]])]]),
        headers: [],
        streamContent: undefined
      })
    } else {
      // concat descriptions
      if (description !== undefined) {
        statusMap.descriptions.add(description)
      }

      if (statusMap.content === undefined) {
        statusMap.content = new Map([[_tag, new Map([[contentType, new Set([schema])]])]])
      } else {
        const schemasByContentType = statusMap.content.get(_tag)
        if (schemasByContentType === undefined) {
          statusMap.content.set(_tag, new Map([[contentType, new Set([schema])]]))
        } else {
          const set = schemasByContentType.get(contentType)
          if (set === undefined) {
            schemasByContentType.set(contentType, new Set([schema]))
          } else {
            set.add(schema)
          }
        }
      }
    }
  }

  function addStreamContent(
    stream: HttpApiSchema.StreamSchema,
    status: number
  ) {
    const statusMap = map.get(status)
    if (statusMap === undefined) {
      map.set(status, {
        descriptions: new Set(),
        content: undefined,
        headers: [],
        streamContent: new Map([[stream.contentType, stream]])
      })
    } else {
      if (statusMap.streamContent === undefined) {
        statusMap.streamContent = new Map([[stream.contentType, stream]])
      } else {
        statusMap.streamContent.set(stream.contentType, stream)
      }
    }
  }
}

function resolveDescriptionOrIdentifier(ast: SchemaAST.AST): string | undefined {
  return SchemaAST.resolveDescription(ast) ?? SchemaAST.resolveIdentifier(ast)
}

type Content = Map<
  HttpApiSchema.Encoding["_tag"],
  Map<
    string, // contentType
    Set<Schema.Constraint>
  >
>

type StreamContent = Map<string, HttpApiSchema.StreamSchema>

const Uint8ArrayEncoding = Schema.String.annotate({
  format: "binary"
})

function toEncodingAST(ast: SchemaAST.AST, _tag: HttpApiSchema.Encoding["_tag"]): SchemaAST.AST {
  switch (_tag) {
    case "Uint8Array":
      return Uint8ArrayEncoding.ast
    case "Text":
      return SchemaAST.isDeclaration(ast) && ast.encoding === undefined ? Schema.String.ast : ast
    case "Multipart":
      ast = persistedFileToBinaryEncoding(ast)
  }
  return InternalToCodec.toCodecJsonAST(ast)
}

function persistedFileToBinaryEncoding(ast: SchemaAST.AST): SchemaAST.AST {
  if (
    SchemaAST.isDeclaration(ast) &&
    ((ast.annotations as (Schema.Annotations.Declaration<unknown, readonly []> | undefined))?.representation?.id ===
      "effect/http/PersistedFile")
  ) {
    return Uint8ArrayEncoding.ast
  }

  if (typeof (ast as any)?.recur === "function") {
    return (ast as any).recur(persistedFileToBinaryEncoding)
  }

  return ast
}

const makeSecurityScheme = (security: HttpApiSecurity): OpenAPISecurityScheme => {
  const meta: Partial<OpenAPISecurityScheme> = {}
  processAnnotation(security.annotations, Description, (description) => {
    meta.description = description
  })
  switch (security._tag) {
    case "Basic": {
      return {
        ...meta,
        type: "http",
        scheme: "basic"
      }
    }
    case "Http": {
      const format = Context.getOption(security.annotations, Format).pipe(
        Option.map((format) => ({ bearerFormat: format })),
        Option.getOrUndefined
      )
      return {
        ...meta,
        type: "http",
        scheme: security.scheme,
        ...format
      }
    }
    case "ApiKey": {
      return {
        ...meta,
        type: "apiKey",
        name: security.key,
        in: security.in
      }
    }
  }
}

const securitySchemeForComparison = (scheme: OpenAPISecurityScheme): OpenAPISecurityScheme => {
  if (scheme.type === "http") {
    return { ...scheme, scheme: scheme.scheme.toLowerCase() }
  }
  if (scheme.in === "header") {
    return { ...scheme, name: scheme.name.toLowerCase() }
  }
  return scheme
}

/**
 * This model describes the OpenAPI specification (version 3.1.0) returned by
 * {@link fromApi}. It is not intended to describe the entire OpenAPI
 * specification, only the output of `fromApi`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenAPISpec {
  openapi: "3.1.0"
  info: OpenAPISpecInfo
  paths: OpenAPISpecPaths
  components: OpenAPIComponents
  security: Array<OpenAPISecurityRequirement>
  tags: Array<OpenAPISpecTag>
  servers?: Array<OpenAPISpecServer>
}

/**
 * OpenAPI `info` object generated by `fromApi`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenAPISpecInfo {
  title: string
  version: string
  description?: string
  license?: OpenAPISpecLicense
  summary?: string
}

/**
 * OpenAPI tag object generated for an HTTP API group.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenAPISpecTag {
  name: string
  description?: string
  externalDocs?: OpenAPISpecExternalDocs
}

/**
 * OpenAPI external documentation metadata.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenAPISpecExternalDocs {
  url: string
  description?: string
}

/**
 * OpenAPI license metadata used in the generated `info` object.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenAPISpecLicense {
  name: string
  url?: string
  [key: string]: unknown
}

/**
 * OpenAPI server object used in the generated `servers` array.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenAPISpecServer {
  url: string
  description?: string
  variables?: Record<string, OpenAPISpecServerVariable>
}

/**
 * OpenAPI variable definition for templated server URLs.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenAPISpecServerVariable {
  default: string
  enum?: NonEmptyArray<string>
  description?: string
}

/**
 * Generated OpenAPI `paths` object, keyed by route path.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type OpenAPISpecPaths = Record<string, OpenAPISpecPathItem>

/**
 * Lowercase HTTP method names used as keys in generated OpenAPI path items.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type OpenAPISpecMethodName =
  | "get"
  | "put"
  | "post"
  | "delete"
  | "options"
  | "head"
  | "patch"
  | "trace"

/**
 * Generated OpenAPI path item mapping HTTP methods to operations for a single route path.
 * Parameters declared here are shared by every operation on the path.
 * `QUERY` operations are emitted under `x-oai-additionalOperations`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type OpenAPISpecPathItem =
  & {
    [K in OpenAPISpecMethodName]?: OpenAPISpecOperation
  }
  & {
    parameters?: Array<OpenAPISpecParameter>
    "x-oai-additionalOperations"?: Partial<Record<HttpMethod.HttpMethod, OpenAPISpecOperation>>
  }

/**
 * Generated OpenAPI parameter object for path, query, header, or cookie parameters.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenAPISpecParameter {
  name: string
  in: "query" | "header" | "path" | "cookie"
  schema: object
  required: boolean
  description?: string
}

/**
 * Generated OpenAPI responses object, keyed by HTTP status code.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type OpenAPISpecResponses = Record<number, OpenApiSpecResponse>

/**
 * Generated OpenAPI content object, keyed by media type.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type OpenApiSpecContent = {
  [K in string]: OpenApiSpecMediaType
}

/**
 * Generated OpenAPI response object for an endpoint success or error schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenApiSpecResponse {
  description: string
  content?: OpenApiSpecContent
  headers?: Record<string, OpenAPISpecHeader>
}

/**
 * Generated OpenAPI response header object.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type OpenAPISpecHeader = Omit<OpenAPISpecParameter, "name" | "in">

/**
 * Generated OpenAPI media type object containing the JSON Schema for a request or response body.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenApiSpecMediaType {
  schema: JsonSchema.JsonSchema
  "x-effect-stream"?: OpenApiSpecEffectStream
}

/**
 * Effect-specific metadata for generated streaming response media types.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type OpenApiSpecEffectStream =
  | {
    encoding: "sse"
    causeSchema: JsonSchema.JsonSchema
    errorSchema: JsonSchema.JsonSchema
    failureEvent: "effect/http-api/stream/failure"
  }
  | {
    encoding: "uint8array"
  }

/**
 * Generated OpenAPI request body object for endpoint payloads.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenAPISpecRequestBody {
  content: OpenApiSpecContent
  required: true
}

/**
 * Generated OpenAPI components containing shared schemas and security schemes.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenAPIComponents {
  schemas: JsonSchema.Definitions
  securitySchemes: Record<string, OpenAPISecurityScheme>
}

/**
 * Generated OpenAPI HTTP security scheme, such as bearer or basic authentication.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenAPIHTTPSecurityScheme {
  readonly type: "http"
  scheme: "bearer" | "basic" | string
  description?: string
  /* only for scheme: 'bearer' */
  bearerFormat?: string
}

/**
 * Generated OpenAPI API key security scheme.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenAPIApiKeySecurityScheme {
  readonly type: "apiKey"
  name: string
  in: "query" | "header" | "cookie"
  description?: string
}

/**
 * Union of security scheme objects emitted in generated OpenAPI components.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type OpenAPISecurityScheme =
  | OpenAPIHTTPSecurityScheme
  | OpenAPIApiKeySecurityScheme

/**
 * Generated OpenAPI security requirement, keyed by security scheme name.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type OpenAPISecurityRequirement = Record<string, Array<string>>

/**
 * Generated OpenAPI operation object for an HTTP API endpoint.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OpenAPISpecOperation {
  operationId: string
  parameters: Array<OpenAPISpecParameter>
  responses: OpenAPISpecResponses
  /** Always contains at least the title annotation or the group identifier */
  tags: NonEmptyArray<string>
  security: Array<OpenAPISecurityRequirement>
  requestBody?: OpenAPISpecRequestBody
  description?: string
  summary?: string
  deprecated?: boolean
  externalDocs?: OpenAPISpecExternalDocs
}
