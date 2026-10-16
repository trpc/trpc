/**
 * OpenAPI-to-HttpClient code generation for the OpenAPI generator.
 *
 * This module defines the `OpenApiTransformer` service used to render parsed
 * OpenAPI operations into Effect `HttpClient` modules. It provides both
 * schema-backed and type-only transformer implementations, including generated
 * imports, public client interfaces, operation implementations, typed API
 * errors, optional response handling, and helpers for server-sent events and
 * binary response streams.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import type { ParsedOpenApi, ParsedOperation, ParsedOperationHttpClientResponses } from "./ParsedOperation.ts"
import * as Utils from "./Utils.ts"

/**
 * Service used by the OpenAPI generator to render parsed operations as an
 * Effect HttpClient module.
 *
 * **Details**
 *
 * A transformer owns the code-generation dialect for imports, public client
 * types, and the implementation body. The generator swaps implementations to
 * choose between schema-backed clients and type-only clients.
 *
 * @category services
 * @since 4.0.0
 */
export class OpenApiTransformer extends Context.Service<
  OpenApiTransformer,
  {
    readonly imports: (importName: string, parsed: ParsedOpenApi) => string
    readonly toTypes: (importName: string, name: string, parsed: ParsedOpenApi) => string
    readonly toImplementation: (importName: string, name: string, parsed: ParsedOpenApi) => string
  }
>()("OpenApiTransformer") {}

interface ImportRequirements {
  readonly eventStream: boolean
  readonly eventStreamData: boolean
  readonly eventStreamSchema: boolean
  readonly octetStream: boolean
}

const computeImportRequirements = (operations: ReadonlyArray<ParsedOperation>): ImportRequirements => {
  let eventStream = false
  let eventStreamData = false
  let eventStreamSchema = false
  let octetStream = false
  for (const op of operations) {
    const responses = op.httpClientResponses
    if (responses.sseSchema) {
      eventStream = true
      if (responses.sseSchemaMode === "event") {
        eventStreamSchema = true
      } else {
        eventStreamData = true
      }
    }
    if (responses.binarySuccessStatuses.size > 0) {
      octetStream = true
    }
  }
  return { eventStream, eventStreamData, eventStreamSchema, octetStream }
}

const requiresStreaming = (requirements: ImportRequirements): boolean =>
  requirements.eventStream || requirements.octetStream

const hasResponseVariants = (responses: ParsedOperationHttpClientResponses): boolean =>
  responses.binarySuccessStatuses.size > 0 ||
  responses.voidSuccessStatuses.size > 0 ||
  responses.voidErrorStatuses.size > 0

const normalizeSuccessStatus = (
  responses: ParsedOperationHttpClientResponses,
  status: string
): string => {
  const successCount = responses.successSchemas.size +
    responses.binarySuccessStatuses.size +
    responses.voidSuccessStatuses.size
  return successCount === 1 && status.startsWith("2") ? "2xx" : status
}

const requestToImpl = (operation: ParsedOperation, pipeline: Array<string>, streaming = false): string => {
  const request = `HttpClientRequest.${operation.method}`
  const pipe = `.pipe(\n      ${pipeline.join(",\n      ")}\n    )`
  if (operation.pathIds.length === 0) {
    return `${request}(${operation.pathTemplate})${pipe}`
  }
  const effect = `__makePathRequest(${request}, [${
    operation.pathIds.join(", ")
  }], () => ${operation.pathTemplate}).pipe(
    Effect.${streaming ? "map" : "flatMap"}((request) => request${pipe})
  )`
  return streaming ? `Stream.unwrap(${effect})` : effect
}

/**
 * Create the transformer used for schema-backed HttpClient output.
 *
 * **Details**
 *
 * Generated clients import Effect Schema values and use them at runtime to
 * decode successful responses and typed API errors. Request parameters and
 * payloads are typed against each schema's encoded representation.
 *
 * @category code generation
 * @since 4.0.0
 */
export const makeTransformerSchema = () => {
  const operationsToInterface = (
    _importName: string,
    name: string,
    operations: ReadonlyArray<ParsedOperation>
  ) => {
    const methods: Array<string> = []
    for (const op of operations) {
      methods.push(operationToMethod(name, op))
      if (op.httpClientResponses.sseSchema) {
        methods.push(operationToSseMethod(name, op))
      }
      if (op.httpClientResponses.binarySuccessStatuses.size > 0) {
        methods.push(operationToBinaryMethod(name, op))
      }
    }
    return `export interface ${name} {
  readonly httpClient: HttpClient.HttpClient
  ${methods.join("\n  ")}
}

${clientErrorSource(name)}`
  }

  const operationToMethod = (name: string, operation: ParsedOperation) => {
    const responses = operation.httpClientResponses
    const args: Array<string> = []
    if (operation.pathIds.length > 0) {
      Utils.spreadElementsInto(operation.pathIds.map((id) => `${id}: string`), args)
    }

    const options: Array<string> = []
    if (operation.params) {
      const key = `readonly params${operation.paramsOptional ? "?" : ""}`
      const type = `typeof ${operation.params}.Encoded${operation.paramsOptional ? " | undefined" : ""}`
      options.push(`${key}: ${type}`)
    }
    if (operation.payload) {
      const key = `readonly payload`
      const type = `typeof ${operation.payload}.Encoded`
      options.push(`${key}: ${type}`)
    }
    const hasOptions = (operation.params && !operation.paramsOptional) || operation.payload

    const successTypes = new Set(Array.from(responses.successSchemas.values(), (schema) => `typeof ${schema}.Type`))
    if (responses.binarySuccessStatuses.size > 0) {
      successTypes.add("Uint8Array")
    }
    if (responses.voidSuccessStatuses.size > 0) {
      successTypes.add("void")
    }
    const success = successTypes.size > 0 ? Array.from(successTypes).join(" | ") : "void"
    const errors = ["HttpClientError.HttpClientError", "SchemaError"]
    if (responses.errorSchemas.size > 0) {
      Utils.spreadElementsInto(
        Array.from(responses.errorSchemas.values()).map(
          (schema) => `${name}Error<"${schema}", typeof ${schema}.Type>`
        ),
        errors
      )
    }
    for (const status of responses.voidErrorStatuses) {
      errors.push(`${name}Error<"${status}", undefined>`)
    }

    const jsdoc = Utils.toComment(operation.description)
    const methodKey = `readonly "${operation.id}"`
    return `${jsdoc}${methodKey}: ${operationSignatures(args, options, Boolean(hasOptions), success, errors)}`
  }

  const operationToSseMethod = (_name: string, operation: ParsedOperation) => {
    const responses = operation.httpClientResponses
    const args: Array<string> = []
    if (operation.pathIds.length > 0) {
      Utils.spreadElementsInto(operation.pathIds.map((id) => `${id}: string`), args)
    }

    const options: Array<string> = []
    if (operation.params) {
      const key = `readonly params${operation.paramsOptional ? "?" : ""}`
      const type = `typeof ${operation.params}.Encoded${operation.paramsOptional ? " | undefined" : ""}`
      options.push(`${key}: ${type}`)
    }
    if (operation.payload) {
      options.push(`readonly payload: typeof ${operation.payload}.Encoded`)
    }

    const hasOptions = (operation.params && !operation.paramsOptional) || operation.payload
    if (hasOptions) {
      args.push(`options: { ${options.join("; ")} }`)
    } else if (options.length > 0) {
      args.push(`options: { ${options.join("; ")} } | undefined`)
    }

    const jsdoc = Utils.toComment(operation.description)
    const methodKey = `readonly "${operation.id}Sse"`
    const parameters = args.join(", ")
    const value = responses.sseSchemaMode === "event"
      ? `typeof ${responses.sseSchema}.Type`
      : `{ readonly event: string; readonly id: string | undefined; readonly data: typeof ${responses.sseSchema}.Type }`
    const returnType =
      `Stream.Stream<${value}, HttpClientError.HttpClientError | SchemaError | Sse.Retry | Sse.SseError, typeof ${responses.sseSchema}.DecodingServices>`
    return `${jsdoc}${methodKey}: (${parameters}) => ${returnType}`
  }

  const operationToBinaryMethod = (_name: string, operation: ParsedOperation) => {
    const args: Array<string> = []
    if (operation.pathIds.length > 0) {
      Utils.spreadElementsInto(operation.pathIds.map((id) => `${id}: string`), args)
    }

    const options: Array<string> = []
    if (operation.params) {
      const key = `readonly params${operation.paramsOptional ? "?" : ""}`
      const type = `typeof ${operation.params}.Encoded${operation.paramsOptional ? " | undefined" : ""}`
      options.push(`${key}: ${type}`)
    }
    if (operation.payload) {
      options.push(`readonly payload: typeof ${operation.payload}.Encoded`)
    }

    const hasOptions = (operation.params && !operation.paramsOptional) || operation.payload
    if (hasOptions) {
      args.push(`options: { ${options.join("; ")} }`)
    } else if (options.length > 0) {
      args.push(`options: { ${options.join("; ")} } | undefined`)
    }

    const jsdoc = Utils.toComment(operation.description)
    const methodKey = `readonly "${operation.id}Stream"`
    const parameters = args.join(", ")
    const returnType = `Stream.Stream<Uint8Array, HttpClientError.HttpClientError>`
    return `${jsdoc}${methodKey}: (${parameters}) => ${returnType}`
  }

  const operationsToImpl = (
    importName: string,
    name: string,
    operations: ReadonlyArray<ParsedOperation>
  ) => {
    const requirements = computeImportRequirements(operations)
    const implMethods: Array<string> = []
    for (const op of operations) {
      implMethods.push(operationToImpl(name, op))
      if (op.httpClientResponses.sseSchema) {
        implMethods.push(operationToSseImpl(importName, op))
      }
      if (op.httpClientResponses.binarySuccessStatuses.size > 0) {
        implMethods.push(operationToBinaryImpl(op))
      }
    }

    const helpers: Array<string> = [commonSource]
    if (operations.some((operation) => operation.pathIds.length > 0)) {
      helpers.push(pathRequestSource)
    }
    if (requiresStreaming(requirements)) {
      helpers.push(executeStreamRequestSource)
    }
    if (requirements.eventStreamData) {
      helpers.push(sseRequestSource(importName))
    }
    if (requirements.eventStreamSchema) {
      helpers.push(sseEventRequestSource)
    }
    if (requirements.octetStream) {
      helpers.push(decodeBinarySource)
      helpers.push(binaryRequestSource)
    }
    if (operations.some((operation) => operation.httpClientResponses.voidErrorStatuses.size > 0)) {
      helpers.push(decodeVoidErrorSource(name))
    }
    return `export interface OperationConfig {
  /**
   * Whether or not the response should be included in the value returned from
   * an operation.
   *
   * If set to \`true\`, a tuple of \`[A, HttpClientResponse]\` will be returned,
   * where \`A\` is the success type of the operation.
   *
   * If set to \`false\`, only the success type of the operation will be returned.
   */
  readonly includeResponse?: boolean | undefined
}

/**
 * A utility type which optionally includes the response in the return result
 * of an operation based upon the value of the \`includeResponse\` configuration
 * option.
 */
export type WithOptionalResponse<A, Config extends OperationConfig | undefined> = Config extends {
  readonly includeResponse: true
} ? [A, HttpClientResponse.HttpClientResponse]
  : Config extends { readonly includeResponse?: false | undefined } | undefined ? A
  : A | [A, HttpClientResponse.HttpClientResponse]

export const make = (
  httpClient: HttpClient.HttpClient,
  options: {
    readonly transformClient?: ((client: HttpClient.HttpClient) => Effect.Effect<HttpClient.HttpClient>) | undefined
  } = {}
): ${name} => {
  ${helpers.join("\n  ")}
  const decodeSuccess =
    <Schema extends ${importName}.Constraint>(schema: Schema) =>
    (response: HttpClientResponse.HttpClientResponse) =>
      HttpClientResponse.schemaBodyJson(schema)(response)
  const decodeError =
    <const Tag extends string, Schema extends ${importName}.Constraint>(tag: Tag, schema: Schema) =>
    (response: HttpClientResponse.HttpClientResponse) =>
      Effect.flatMap(
        HttpClientResponse.schemaBodyJson(schema)(response),
        (cause) => Effect.fail(${name}Error(tag, cause, response)),
      )
  return {
    httpClient,
    ${implMethods.join(",\n    ")}
  }
}`
  }

  const operationToImpl = (name: string, operation: ParsedOperation) => {
    const responses = operation.httpClientResponses
    const params = [
      ...operation.pathIds,
      `options: Parameters<${name}["${operation.id}"]>[${operation.pathIds.length}]`
    ].join(", ")

    const pipeline: Array<string> = []

    if (operation.params) {
      const paramsAccessor = resolveParamsAccessor(operation, "options", "params")

      if (operation.urlParams.length > 0) {
        const props = operation.urlParams.map(
          (param) => `"${param}": ${paramsAccessor}["${param}"] as any`
        )
        pipeline.push(`HttpClientRequest.setUrlParams({ ${props.join(", ")} })`)
      }
      if (operation.headers.length > 0) {
        const props = operation.headers.map(
          (param) => `"${param}": ${paramsAccessor}["${param}"] ?? undefined`
        )
        pipeline.push(`HttpClientRequest.setHeaders({ ${props.join(", ")} })`)
      }
    }

    const payloadVarName = "options.payload"
    if (operation.payloadFormData) {
      pipeline.push(`HttpClientRequest.bodyFormDataRecord(${payloadVarName} as any)`)
    } else if (operation.payloadFormUrlEncoded) {
      pipeline.push(`HttpClientRequest.bodyUrlParams(${payloadVarName} as any)`)
    } else if (operation.payload) {
      pipeline.push(`HttpClientRequest.bodyJsonUnsafe(${payloadVarName})`)
    }

    const decodes: Array<string> = []
    responses.successSchemas.forEach((schema, status) => {
      decodes.push(`"${normalizeSuccessStatus(responses, status)}": decodeSuccess(${schema})`)
    })
    responses.binarySuccessStatuses.forEach((status) => {
      decodes.push(`"${normalizeSuccessStatus(responses, status)}": decodeBinary`)
    })
    responses.errorSchemas.forEach((schema, status) => {
      decodes.push(`"${status}": decodeError("${schema}", ${schema})`)
    })
    responses.voidSuccessStatuses.forEach((status) => {
      decodes.push(`"${status}": () => Effect.void`)
    })
    responses.voidErrorStatuses.forEach((status) => {
      decodes.push(`"${status}": decodeVoidError("${status}")`)
    })
    decodes.push(`orElse: unexpectedStatus`)

    const configAccessor = resolveConfigAccessor(operation, "options", "config")
    pipeline.push(`withResponse(${configAccessor})(HttpClientResponse.matchStatus({
      ${decodes.join(",\n      ")}
    }))`)

    return (
      `"${operation.id}": (${params}) => ` +
      requestToImpl(operation, pipeline)
    )
  }

  const operationToSseImpl = (_importName: string, operation: ParsedOperation) => {
    const responses = operation.httpClientResponses
    const args: Array<string> = [...operation.pathIds]
    const hasOptions = (operation.params && !operation.paramsOptional) || operation.payload
    if (hasOptions || operation.params || operation.payload) {
      args.push("options")
    }
    const params = args.join(", ")

    const pipeline: Array<string> = []

    if (operation.params) {
      const paramsAccessor = resolveParamsAccessor(operation, "options", "params")
      if (operation.urlParams.length > 0) {
        const props = operation.urlParams.map(
          (param) => `"${param}": ${paramsAccessor}["${param}"] as any`
        )
        pipeline.push(`HttpClientRequest.setUrlParams({ ${props.join(", ")} })`)
      }
      if (operation.headers.length > 0) {
        const props = operation.headers.map(
          (param) => `"${param}": ${paramsAccessor}["${param}"] ?? undefined`
        )
        pipeline.push(`HttpClientRequest.setHeaders({ ${props.join(", ")} })`)
      }
    }

    if (operation.payloadFormData) {
      pipeline.push(`HttpClientRequest.bodyFormDataRecord(options.payload as any)`)
    } else if (operation.payloadFormUrlEncoded) {
      pipeline.push(`HttpClientRequest.bodyUrlParams(options.payload as any)`)
    } else if (operation.payload) {
      pipeline.push(`HttpClientRequest.bodyJsonUnsafe(options.payload)`)
    }

    pipeline.push(`${responses.sseSchemaMode === "event" ? "sseEventRequest" : "sseRequest"}(${responses.sseSchema})`)

    return (
      `"${operation.id}Sse": (${params}) => ` +
      requestToImpl(operation, pipeline, true)
    )
  }

  const operationToBinaryImpl = (operation: ParsedOperation) => {
    const args: Array<string> = [...operation.pathIds]
    const hasOptions = (operation.params && !operation.paramsOptional) || operation.payload
    if (hasOptions || operation.params || operation.payload) {
      args.push("options")
    }
    const params = args.join(", ")

    const pipeline: Array<string> = []

    if (operation.params) {
      const paramsAccessor = resolveParamsAccessor(operation, "options", "params")
      if (operation.urlParams.length > 0) {
        const props = operation.urlParams.map(
          (param) => `"${param}": ${paramsAccessor}["${param}"] as any`
        )
        pipeline.push(`HttpClientRequest.setUrlParams({ ${props.join(", ")} })`)
      }
      if (operation.headers.length > 0) {
        const props = operation.headers.map(
          (param) => `"${param}": ${paramsAccessor}["${param}"] ?? undefined`
        )
        pipeline.push(`HttpClientRequest.setHeaders({ ${props.join(", ")} })`)
      }
    }

    if (operation.payloadFormData) {
      pipeline.push(`HttpClientRequest.bodyFormDataRecord(options.payload as any)`)
    } else if (operation.payloadFormUrlEncoded) {
      pipeline.push(`HttpClientRequest.bodyUrlParams(options.payload as any)`)
    } else if (operation.payload) {
      pipeline.push(`HttpClientRequest.bodyJsonUnsafe(options.payload)`)
    }

    pipeline.push(`binaryRequest`)

    return (
      `"${operation.id}Stream": (${params}) => ` +
      requestToImpl(operation, pipeline, true)
    )
  }

  return OpenApiTransformer.of({
    imports: (importName, parsed) => {
      const operations = parsed.operations
      const requirements = computeImportRequirements(operations)
      const imports = [
        `import * as Data from "effect/Data"`,
        `import * as Effect from "effect/Effect"`,
        `import type { SchemaError } from "effect/Schema"`,
        `import * as ${importName} from "effect/Schema"`
      ]
      if (requiresStreaming(requirements)) {
        imports.push(`import * as Stream from "effect/Stream"`)
      }
      if (requirements.eventStream) {
        imports.push(`import * as Sse from "effect/encoding/Sse"`)
      }
      // HttpClient needs to be a value import when streaming is used (for filterStatusOk)
      if (requiresStreaming(requirements)) {
        imports.push(`import * as HttpClient from "effect/http/HttpClient"`)
      } else {
        imports.push(`import type * as HttpClient from "effect/http/HttpClient"`)
      }
      imports.push(
        `import * as HttpClientError from "effect/http/HttpClientError"`,
        `import * as HttpClientRequest from "effect/http/HttpClientRequest"`,
        `import * as HttpClientResponse from "effect/http/HttpClientResponse"`
      )
      return imports.join("\n")
    },
    toTypes: (importName, name, parsed) => operationsToInterface(importName, name, parsed.operations),
    toImplementation: (importName, name, parsed) => operationsToImpl(importName, name, parsed.operations)
  })
}

/**
 * Layer that provides the schema-backed OpenApiTransformer service.
 *
 * **When to use**
 *
 * Use when you use this layer when generated HttpClient code should perform runtime response
 * decoding with generated Effect Schema values.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerTransformerSchema = Layer.sync(
  OpenApiTransformer,
  makeTransformerSchema
)

/**
 * Create the transformer used for type-only HttpClient output.
 *
 * **Details**
 *
 * Generated clients reference emitted TypeScript types directly and do not
 * import schema decoders for JSON response bodies. Responses are typed as the
 * declared operation result while preserving generated error and stream method
 * shapes.
 *
 * @category code generation
 * @since 4.0.0
 */
export const makeTransformerTs = () => {
  const operationsToInterface = (
    _importName: string,
    name: string,
    operations: ReadonlyArray<ParsedOperation>
  ) => {
    const methods: Array<string> = []
    for (const op of operations) {
      methods.push(operationToMethod(name, op))
      if (op.httpClientResponses.sseSchema) {
        methods.push(operationToSseMethod(op))
      }
      if (op.httpClientResponses.binarySuccessStatuses.size > 0) {
        methods.push(operationToBinaryMethod(op))
      }
    }
    return `export interface ${name} {
  readonly httpClient: HttpClient.HttpClient
  ${methods.join("\n  ")}
}

${clientErrorSource(name)}`
  }

  const operationToMethod = (name: string, operation: ParsedOperation) => {
    const responses = operation.httpClientResponses
    const args: Array<string> = []
    if (operation.pathIds.length > 0) {
      Utils.spreadElementsInto(operation.pathIds.map((id) => `${id}: string`), args)
    }

    const options: Array<string> = []
    if (operation.params) {
      const key = `readonly params${operation.paramsOptional ? "?" : ""}`
      const type = `${operation.params}${operation.paramsOptional ? " | undefined" : ""}`
      options.push(`${key}: ${type}`)
    }
    if (operation.payload) {
      options.push(`readonly payload: ${operation.payload}`)
    }
    const hasOptions = (operation.params && !operation.paramsOptional) || operation.payload

    const successTypes = new Set(responses.successSchemas.values())
    if (responses.binarySuccessStatuses.size > 0) {
      successTypes.add("Uint8Array")
    }
    if (responses.voidSuccessStatuses.size > 0) {
      successTypes.add("void")
    }
    const success = successTypes.size > 0 ? Array.from(successTypes).join(" | ") : "void"

    const errors = ["HttpClientError.HttpClientError"]
    if (responses.errorSchemas.size > 0) {
      for (const schema of responses.errorSchemas.values()) {
        errors.push(`${name}Error<"${schema}", ${schema}>`)
      }
    }
    for (const status of responses.voidErrorStatuses) {
      errors.push(`${name}Error<"${status}", undefined>`)
    }

    const jsdoc = Utils.toComment(operation.description)
    const methodKey = `readonly "${operation.id}"`
    return `${jsdoc}${methodKey}: ${operationSignatures(args, options, Boolean(hasOptions), success, errors)}`
  }

  const operationToSseMethod = (operation: ParsedOperation) => {
    const responses = operation.httpClientResponses
    const args: Array<string> = []
    if (operation.pathIds.length > 0) {
      Utils.spreadElementsInto(operation.pathIds.map((id) => `${id}: string`), args)
    }

    const options: Array<string> = []
    if (operation.params) {
      const key = `readonly params${operation.paramsOptional ? "?" : ""}`
      const type = `${operation.params}${operation.paramsOptional ? " | undefined" : ""}`
      options.push(`${key}: ${type}`)
    }
    if (operation.payload) {
      options.push(`readonly payload: ${operation.payload}`)
    }

    const hasOptions = (operation.params && !operation.paramsOptional) || operation.payload
    if (hasOptions) {
      args.push(`options: { ${options.join("; ")} }`)
    } else if (options.length > 0) {
      args.push(`options: { ${options.join("; ")} } | undefined`)
    }

    const jsdoc = Utils.toComment(operation.description)
    const methodKey = `readonly "${operation.id}Sse"`
    const parameters = args.join(", ")
    const returnType = `Stream.Stream<${responses.sseSchema}, HttpClientError.HttpClientError>`
    return `${jsdoc}${methodKey}: (${parameters}) => ${returnType}`
  }

  const operationToBinaryMethod = (operation: ParsedOperation) => {
    const args: Array<string> = []
    if (operation.pathIds.length > 0) {
      Utils.spreadElementsInto(operation.pathIds.map((id) => `${id}: string`), args)
    }

    const options: Array<string> = []
    if (operation.params) {
      const key = `readonly params${operation.paramsOptional ? "?" : ""}`
      const type = `${operation.params}${operation.paramsOptional ? " | undefined" : ""}`
      options.push(`${key}: ${type}`)
    }
    if (operation.payload) {
      options.push(`readonly payload: ${operation.payload}`)
    }

    const hasOptions = (operation.params && !operation.paramsOptional) || operation.payload
    if (hasOptions) {
      args.push(`options: { ${options.join("; ")} }`)
    } else if (options.length > 0) {
      args.push(`options: { ${options.join("; ")} } | undefined`)
    }

    const jsdoc = Utils.toComment(operation.description)
    const methodKey = `readonly "${operation.id}Stream"`
    const parameters = args.join(", ")
    const returnType = `Stream.Stream<Uint8Array, HttpClientError.HttpClientError>`
    return `${jsdoc}${methodKey}: (${parameters}) => ${returnType}`
  }

  const operationsToImpl = (
    _importName: string,
    name: string,
    operations: ReadonlyArray<ParsedOperation>
  ) => {
    const requirements = computeImportRequirements(operations)
    const implMethods: Array<string> = []
    for (const op of operations) {
      implMethods.push(operationToImpl(name, op))
      if (op.httpClientResponses.sseSchema) {
        implMethods.push(operationToSseImpl(op))
      }
      if (op.httpClientResponses.binarySuccessStatuses.size > 0) {
        implMethods.push(operationToBinaryImpl(op))
      }
    }

    const helpers: Array<string> = [commonSource]
    if (operations.some((operation) => operation.pathIds.length > 0)) {
      helpers.push(pathRequestSource)
    }
    if (requiresStreaming(requirements)) {
      helpers.push(executeStreamRequestSource)
    }
    if (requirements.eventStream) {
      helpers.push(sseRequestSourceTs)
    }
    const withResponseVariants = operations.some((op) => hasResponseVariants(op.httpClientResponses))
    if (withResponseVariants) {
      helpers.push(decodeBinarySource)
      helpers.push(decodeVoidErrorSource(name))
    }
    if (requirements.octetStream) {
      helpers.push(binaryRequestSourceTs)
    }

    return `export interface OperationConfig {
  /**
   * Whether or not the response should be included in the value returned from
   * an operation.
   *
   * If set to \`true\`, a tuple of \`[A, HttpClientResponse]\` will be returned,
   * where \`A\` is the success type of the operation.
   *
   * If set to \`false\`, only the success type of the operation will be returned.
   */
  readonly includeResponse?: boolean | undefined
}

/**
 * A utility type which optionally includes the response in the return result
 * of an operation based upon the value of the \`includeResponse\` configuration
 * option.
 */
export type WithOptionalResponse<A, Config extends OperationConfig | undefined> = Config extends {
  readonly includeResponse: true
} ? [A, HttpClientResponse.HttpClientResponse]
  : Config extends { readonly includeResponse?: false | undefined } | undefined ? A
  : A | [A, HttpClientResponse.HttpClientResponse]

export const make = (
  httpClient: HttpClient.HttpClient,
  options: {
    readonly transformClient?: ((client: HttpClient.HttpClient) => Effect.Effect<HttpClient.HttpClient>) | undefined
  } = {}
): ${name} => {
  ${helpers.join("\n  ")}
  const decodeSuccess = <A>(response: HttpClientResponse.HttpClientResponse) =>
    response.json as Effect.Effect<A, HttpClientError.HttpClientError>
  const decodeVoid = (_response: HttpClientResponse.HttpClientResponse) =>
    Effect.void
  const decodeError =
    <Tag extends string, E>(tag: Tag) =>
    (
      response: HttpClientResponse.HttpClientResponse,
    ): Effect.Effect<
      never,
      ${name}Error<Tag, E> | HttpClientError.HttpClientError
    > =>
      Effect.flatMap(
        response.json as Effect.Effect<E, HttpClientError.HttpClientError>,
        (cause) => Effect.fail(${name}Error(tag, cause, response)),
      )
  ${onRequestSource(withResponseVariants)}
  return {
    httpClient,
    ${implMethods.join(",\n    ")}
  }
}`
  }

  const operationToImpl = (name: string, operation: ParsedOperation) => {
    const responses = operation.httpClientResponses
    const params = [
      ...operation.pathIds,
      `options: Parameters<${name}["${operation.id}"]>[${operation.pathIds.length}]`
    ].join(", ")

    const pipeline: Array<string> = []

    if (operation.params) {
      const paramsAccessor = resolveParamsAccessor(operation, "options", "params")

      if (operation.urlParams.length > 0) {
        const props = operation.urlParams.map(
          (param) => `"${param}": ${paramsAccessor}["${param}"] as any`
        )
        pipeline.push(`HttpClientRequest.setUrlParams({ ${props.join(", ")} })`)
      }
      if (operation.headers.length > 0) {
        const props = operation.headers.map(
          (param) => `"${param}": ${paramsAccessor}["${param}"] ?? undefined`
        )
        pipeline.push(`HttpClientRequest.setHeaders({ ${props.join(", ")} })`)
      }
    }

    const payloadAccessor = "options.payload"
    if (operation.payloadFormData) {
      pipeline.push(`HttpClientRequest.bodyFormDataRecord(${payloadAccessor} as any)`)
    } else if (operation.payloadFormUrlEncoded) {
      pipeline.push(`HttpClientRequest.bodyUrlParams(${payloadAccessor} as any)`)
    } else if (operation.payload) {
      pipeline.push(`HttpClientRequest.bodyJsonUnsafe(${payloadAccessor})`)
    }

    const successCodes = Array.from(
      responses.successSchemas.keys(),
      (status) => JSON.stringify(normalizeSuccessStatus(responses, status))
    ).join(", ")
    const errorCodes = responses.errorSchemas.size > 0 &&
      Object.fromEntries(responses.errorSchemas.entries())
    const configAccessor = resolveConfigAccessor(operation, "options", "config")
    const requestArgs = [`[${successCodes}]`]
    if (hasResponseVariants(responses)) {
      const responseCodes = {
        binary: Array.from(
          responses.binarySuccessStatuses,
          (status) => normalizeSuccessStatus(responses, status)
        ),
        voidSuccess: Array.from(responses.voidSuccessStatuses),
        voidError: Array.from(responses.voidErrorStatuses)
      }
      requestArgs.push(errorCodes ? JSON.stringify(errorCodes) : "undefined", JSON.stringify(responseCodes))
    } else if (errorCodes) {
      requestArgs.push(JSON.stringify(errorCodes))
    }
    pipeline.push(`onRequest(${configAccessor})(${requestArgs.join(", ")})`)

    return (
      `"${operation.id}": (${params}) => ` +
      requestToImpl(operation, pipeline)
    )
  }

  const operationToSseImpl = (operation: ParsedOperation) => {
    const args: Array<string> = [...operation.pathIds]
    const hasOptions = (operation.params && !operation.paramsOptional) || operation.payload
    if (hasOptions || operation.params || operation.payload) {
      args.push("options")
    }
    const params = args.join(", ")

    const pipeline: Array<string> = []

    if (operation.params) {
      const paramsAccessor = resolveParamsAccessor(operation, "options", "params")
      if (operation.urlParams.length > 0) {
        const props = operation.urlParams.map(
          (param) => `"${param}": ${paramsAccessor}["${param}"] as any`
        )
        pipeline.push(`HttpClientRequest.setUrlParams({ ${props.join(", ")} })`)
      }
      if (operation.headers.length > 0) {
        const props = operation.headers.map(
          (param) => `"${param}": ${paramsAccessor}["${param}"] ?? undefined`
        )
        pipeline.push(`HttpClientRequest.setHeaders({ ${props.join(", ")} })`)
      }
    }

    if (operation.payloadFormData) {
      pipeline.push(`HttpClientRequest.bodyFormDataRecord(options.payload as any)`)
    } else if (operation.payloadFormUrlEncoded) {
      pipeline.push(`HttpClientRequest.bodyUrlParams(options.payload as any)`)
    } else if (operation.payload) {
      pipeline.push(`HttpClientRequest.bodyJsonUnsafe(options.payload)`)
    }

    pipeline.push(`sseRequest`)

    return (
      `"${operation.id}Sse": (${params}) => ` +
      requestToImpl(operation, pipeline, true)
    )
  }

  const operationToBinaryImpl = (operation: ParsedOperation) => {
    const args: Array<string> = [...operation.pathIds]
    const hasOptions = (operation.params && !operation.paramsOptional) || operation.payload
    if (hasOptions || operation.params || operation.payload) {
      args.push("options")
    }
    const params = args.join(", ")

    const pipeline: Array<string> = []

    if (operation.params) {
      const paramsAccessor = resolveParamsAccessor(operation, "options", "params")
      if (operation.urlParams.length > 0) {
        const props = operation.urlParams.map(
          (param) => `"${param}": ${paramsAccessor}["${param}"] as any`
        )
        pipeline.push(`HttpClientRequest.setUrlParams({ ${props.join(", ")} })`)
      }
      if (operation.headers.length > 0) {
        const props = operation.headers.map(
          (param) => `"${param}": ${paramsAccessor}["${param}"] ?? undefined`
        )
        pipeline.push(`HttpClientRequest.setHeaders({ ${props.join(", ")} })`)
      }
    }

    if (operation.payloadFormData) {
      pipeline.push(`HttpClientRequest.bodyFormDataRecord(options.payload as any)`)
    } else if (operation.payloadFormUrlEncoded) {
      pipeline.push(`HttpClientRequest.bodyUrlParams(options.payload as any)`)
    } else if (operation.payload) {
      pipeline.push(`HttpClientRequest.bodyJsonUnsafe(options.payload)`)
    }

    pipeline.push(`binaryRequest`)

    return (
      `"${operation.id}Stream": (${params}) => ` +
      requestToImpl(operation, pipeline, true)
    )
  }

  return OpenApiTransformer.of({
    imports: (_importName, parsed) => {
      const operations = parsed.operations
      const requirements = computeImportRequirements(operations)
      const imports = [
        `import * as Data from "effect/Data"`,
        `import * as Effect from "effect/Effect"`
      ]
      if (requiresStreaming(requirements)) {
        imports.push(
          `import * as Stream from "effect/Stream"`,
          `import * as HttpClient from "effect/http/HttpClient"`
        )
      } else {
        imports.push(`import type * as HttpClient from "effect/http/HttpClient"`)
      }
      imports.push(
        `import * as HttpClientError from "effect/http/HttpClientError"`,
        `import * as HttpClientRequest from "effect/http/HttpClientRequest"`,
        `import * as HttpClientResponse from "effect/http/HttpClientResponse"`
      )
      return imports.join("\n")
    },
    toTypes: (importName, name, parsed) => operationsToInterface(importName, name, parsed.operations),
    toImplementation: (importName, name, parsed) => operationsToImpl(importName, name, parsed.operations)
  })
}

/**
 * Layer that provides the type-only OpenApiTransformer service.
 *
 * **When to use**
 *
 * Use when you use this layer for the `httpclient-type-only` generator format, where the
 * generated client relies on TypeScript types instead of runtime Schema
 * decoding.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerTransformerTs = Layer.sync(
  OpenApiTransformer,
  makeTransformerTs
)

const pathRequestSource = `const __encodePathParam = encodeURIComponent
  const __makePathRequest = (
    method: (url: string) => HttpClientRequest.HttpClientRequest,
    parameters: ReadonlyArray<string>,
    getPath: () => string,
  ) => Effect.suspend(() => {
    const fail = (description: string, cause?: unknown) => Effect.fail(
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.InvalidUrlError({
          request: method(""),
          cause,
          description,
        }),
      }),
    )
    if (parameters.some((value) => value === "" || /^(?:\\.|%2e){1,2}$/i.test(value))) {
      return fail("Path parameters must be non-empty and cannot be dot segments")
    }
    let path: string
    try {
      path = getPath()
    } catch (cause) {
      return fail("Failed to encode path parameter", cause)
    }
    if (path.split("/").some((segment) => /^(?:\\.|%2e){1,2}$/i.test(segment))) {
      return fail("Request paths cannot contain dot segments")
    }
    return Effect.succeed(method(path))
  })`

const commonSource = `const unexpectedStatus = (response: HttpClientResponse.HttpClientResponse) =>
    Effect.flatMap(
      Effect.orElseSucceed(response.json, () => "Unexpected status code"),
      (description) =>
        Effect.fail(
          new HttpClientError.HttpClientError({
            reason: new HttpClientError.StatusCodeError({
              request: response.request,
              response,
              description: typeof description === "string" ? description : JSON.stringify(description),
            }),
          }),
        ),
    )
  const withResponse = <Config extends OperationConfig>(config: Config | undefined) => (
    f: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<any, any>,
  ): (request: HttpClientRequest.HttpClientRequest) => Effect.Effect<any, any> => {
    const withOptionalResponse = (
      config?.includeResponse
        ? (response: HttpClientResponse.HttpClientResponse) => Effect.map(f(response), (a) => [a, response])
        : (response: HttpClientResponse.HttpClientResponse) => f(response)
    ) as any
    return options?.transformClient
      ? (request) =>
          Effect.flatMap(
            Effect.flatMap(options.transformClient!(httpClient), (client) => client.execute(request)),
            withOptionalResponse
          )
      : (request) => Effect.flatMap(httpClient.execute(request), withOptionalResponse)
  }`

const decodeBinarySource = `const decodeBinary = (response: HttpClientResponse.HttpClientResponse) =>
    Effect.map(response.arrayBuffer, (buffer) => new Uint8Array(buffer))`

const decodeVoidErrorSource = (name: string) =>
  `const decodeVoidError = <const Tag extends string>(tag: Tag) =>
    (response: HttpClientResponse.HttpClientResponse) =>
      Effect.fail(${name}Error(tag, undefined, response))`

const onRequestSource = (withResponseVariants: boolean) => {
  const responseCodesParam = withResponseVariants
    ? `
    responseCodes: {
      readonly binary: ReadonlyArray<string>
      readonly voidSuccess: ReadonlyArray<string>
      readonly voidError: ReadonlyArray<string>
    } = { binary: [], voidSuccess: [], voidError: [] },`
    : ""
  const responseCodesCases = withResponseVariants
    ? `
    for (const code of responseCodes.binary) {
      cases[code] = decodeBinary
    }
    for (const code of responseCodes.voidSuccess) {
      cases[code] = decodeVoid
    }
    for (const code of responseCodes.voidError) {
      cases[code] = decodeVoidError(code)
    }`
    : ""
  const voidFallbackCondition = withResponseVariants
    ? "successCodes.length === 0 && responseCodes.binary.length === 0 && responseCodes.voidSuccess.length === 0"
    : "successCodes.length === 0"
  return `const onRequest = <Config extends OperationConfig>(config: Config | undefined) => (
    successCodes: ReadonlyArray<string>,
    errorCodes?: Record<string, string>,${responseCodesParam}
  ) => {
    const cases: any = { orElse: unexpectedStatus }
    for (const code of successCodes) {
      cases[code] = decodeSuccess
    }
    if (errorCodes) {
      for (const [code, tag] of Object.entries(errorCodes)) {
        cases[code] = decodeError(tag)
      }
    }${responseCodesCases}
    if (${voidFallbackCondition}) {
      cases["2xx"] = decodeVoid
    }
    return withResponse(config)(HttpClientResponse.matchStatus(cases) as any)
  }`
}

const executeStreamRequestSource = `const executeStreamRequest = (request: HttpClientRequest.HttpClientRequest) =>
    Effect.suspend(() =>
      options.transformClient
        ? Effect.flatMap(options.transformClient(httpClient), (client) => HttpClient.filterStatusOk(client).execute(request))
        : HttpClient.filterStatusOk(httpClient).execute(request)
    )`

const sseRequestSource = (_importName: string) =>
  `const sseRequest = <
     Type,
     DecodingServices
    >(
      schema: Schema.ConstraintDecoder<Type, DecodingServices>
    ) =>
    (
      request: HttpClientRequest.HttpClientRequest
    ): Stream.Stream<
      { readonly event: string; readonly id: string | undefined; readonly data: Type },
      HttpClientError.HttpClientError | SchemaError | Sse.Retry | Sse.SseError,
      DecodingServices
    > =>
      executeStreamRequest(request).pipe(
        Effect.map((response) => response.stream),
        Stream.unwrap,
        Stream.decodeText(),
        Stream.pipeThroughChannel(Sse.decodeDataSchema(schema))
      )`

const sseEventRequestSource = `const sseEventRequest = <S extends Sse.EventCodec>(schema: S) =>
    (
      request: HttpClientRequest.HttpClientRequest
    ): Stream.Stream<
      S["Type"],
      HttpClientError.HttpClientError | SchemaError | Sse.Retry | Sse.SseError,
      S["DecodingServices"]
    > =>
      executeStreamRequest(request).pipe(
        Effect.map((response) => response.stream),
        Stream.unwrap,
        Stream.decodeText(),
        Stream.pipeThroughChannel(Sse.decodeSchema(schema))
      )`

const binaryRequestSource =
  `const binaryRequest = (request: HttpClientRequest.HttpClientRequest): Stream.Stream<Uint8Array, HttpClientError.HttpClientError> =>
    executeStreamRequest(request).pipe(
      Effect.map((response) => response.stream),
      Stream.unwrap
    )`

// Type-only mode helpers (no schema decoding)
const sseRequestSourceTs =
  `const sseRequest = (request: HttpClientRequest.HttpClientRequest): Stream.Stream<unknown, HttpClientError.HttpClientError> =>
    executeStreamRequest(request).pipe(
      Effect.map((response) => response.stream),
      Stream.unwrap,
      Stream.decodeText(),
      Stream.splitLines,
      Stream.filter((line) => line.startsWith("data: ")),
      Stream.map((line) => JSON.parse(line.slice(6)))
    )`

const binaryRequestSourceTs =
  `const binaryRequest = (request: HttpClientRequest.HttpClientRequest): Stream.Stream<Uint8Array, HttpClientError.HttpClientError> =>
    executeStreamRequest(request).pipe(
      Effect.map((response) => response.stream),
      Stream.unwrap
    )`

const clientErrorSource = (
  name: string
) =>
  `export interface ${name}Error<Tag extends string, E> {
  readonly _tag: Tag
  readonly request: HttpClientRequest.HttpClientRequest
  readonly response: HttpClientResponse.HttpClientResponse
  readonly cause: E
}

class ${name}ErrorImpl extends Data.Error<{
  _tag: string
  cause: any
  request: HttpClientRequest.HttpClientRequest
  response: HttpClientResponse.HttpClientResponse
}> {}

export const ${name}Error = <Tag extends string, E>(
  tag: Tag,
  cause: E,
  response: HttpClientResponse.HttpClientResponse,
): ${name}Error<Tag, E> =>
  new ${name}ErrorImpl({
    _tag: tag,
    cause,
    response,
    request: response.request,
  }) as any`

const operationSignatures = (
  args: ReadonlyArray<string>,
  options: ReadonlyArray<string>,
  optionsRequired: boolean,
  success: string,
  errors: ReadonlyArray<string>
): string => {
  const signature = (configOptional: boolean) => {
    const config = configOptional ? "Config | undefined" : "Config"
    const fields = [...options, `readonly config${configOptional ? "?" : ""}: ${config}`].join("; ")
    const parameters = [...args, `options: { ${fields} }${configOptional && !optionsRequired ? " | undefined" : ""}`]
    return `    <Config extends OperationConfig | undefined = undefined>(${
      parameters.join(", ")
    }): Effect.Effect<WithOptionalResponse<${success}, ${config}>, ${errors.join(" | ")}>;`
  }
  // Infer the whole config from a required property before allowing omitted config.
  // An optional property would otherwise discard undefined during inference.
  return `{
${signature(false)}
${signature(true)}
  }`
}

const resolveConfigAccessor = (operation: ParsedOperation, rootKey: string, configKey: string): string => {
  // If an operation payload is defined, then the root object must exist
  if (Predicate.isNotUndefined(operation.payload)) {
    return `${rootKey}.${configKey}`
  }

  // If operation parameters are defined and non-optional, then the root object must exist
  if (Predicate.isNotUndefined(operation.params) && !operation.paramsOptional) {
    return `${rootKey}.${configKey}`
  }

  // User-specified arguments are allowed but are not required, so the root object is optional
  return `${rootKey}?.${configKey}`
}

const resolveParamsAccessor = (operation: ParsedOperation, rootKey: string, paramsKey: string): string => {
  // If an operation payload is not defined and parameters are optional, then the
  // root object may or may not exist and parameters must be marked as optional
  if (Predicate.isUndefined(operation.payload) && operation.paramsOptional) {
    return `${rootKey}?.${paramsKey}?.`
  }

  // If parameters are optional, they must be marked as optional
  if (operation.paramsOptional) {
    return `${rootKey}.${paramsKey}?.`
  }

  return `${rootKey}.${paramsKey}`
}
