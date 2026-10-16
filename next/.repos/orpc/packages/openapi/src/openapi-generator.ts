import type { AnyProcedureContract, AnySchema, RouterContract } from '@orpc/contract'
import type { JsonSchema, JsonSchemaConverter, JsonSchemaConverterDirection } from '@orpc/json-schema'
import type { AnyProcedure, AnyRouter } from '@orpc/server'
import type { Public, Value } from '@orpc/shared'
import type { OpenAPIMeta } from './meta'
import type { OpenAPIErrorBodyDefinition, OpenAPIOperationContext } from './openapi-generator-operation'
import type { OpenAPIDocument, OpenAPIV3_2, OpenAPIVersion } from './types'
import { downgradeSpecV31ToV30, downgradeSpecV32ToV31 } from '@openapi-spec/downgrader'
import { COMMON_ERROR_STATUS_MAP } from '@orpc/client'
import { combineJsonSchemasWithComposition, DelegatingJsonSchemaConverter, hoistRecursiveRefToDef, StandardJsonSchemaConverter } from '@orpc/json-schema'
import { walkProcedureContractsAsync } from '@orpc/server'
import { clone, mergeHttpPath, pathToHttpPath, toArray, value } from '@orpc/shared'
import { DEFAULT_OPENAPI_METHOD } from './constants'
import { getOpenAPIMeta } from './meta'
import { OpenAPIComponentRegistry } from './openapi-generator-components'
import {
  buildErrorResponse,
  buildRequest,
  buildSuccessResponse,
  OpenAPIGeneratorError,
  toOpenAPIPath,
} from './openapi-generator-operation'
import { OpenAPISerializer } from './openapi-serializer'
import { getDynamicPathParams } from './utils'

export { OpenAPIGeneratorError } from './openapi-generator-operation'
export type { OpenAPIErrorBodyDefinition } from './openapi-generator-operation'

export interface OpenAPIGeneratorOptions {
  converters?: JsonSchemaConverter[] | undefined

  /**
   * The serializer used to serialize the generated OpenAPI documentation
   */
  serializer?: Public<OpenAPISerializer> | undefined
}

export interface OpenAPIGeneratorGenerateOptions<TVersion extends OpenAPIVersion> {
  /**
   * The OpenAPI version of the generated document.
   * The document is generated as OpenAPI 3.2 and downgraded when an older version is requested.
   * The minor version selects the conversion, the document carries the exact value, such as `3.1.0`.
   *
   * @default '3.2.0'
   */
  version?: TVersion | undefined

  /**
   * OpenAPI 3.2 document fields to start from, such as `info`, `servers`, or `components`.
   * They are downgraded with the rest of the document when an older `version` is requested.
   * The `openapi` field is derived from `version`.
   */
  base?: Partial<Omit<OpenAPIV3_2.OpenAPIObject, 'openapi'>> | undefined

  /**
   * Root-level `$defs` are always moved into `components.schemas`.
   * Use this to customize the component name of a hoisted def.
   *
   * @remarks
   * - The returned name is a preference, conflicting names are still postfixed (`Planet`, `PlanetInput`, `Planet2`, ...).
   * - Return `undefined` to keep the original def name.
   *
   * @default defName => defName
   */
  customComponentName?: (defName: string, defSchema: JsonSchema) => string | undefined

  /**
   * Filter procedures. Return `false` to exclude a procedure from the OpenAPI specification.
   *
   * @default true
   */
  filter?: Value<boolean, [contract: AnyProcedureContract | AnyProcedure, path: string[]]>

  /**
   * Define a custom JSON schema for the error response body when using
   * type-safe errors. Helps align ORPC error formatting with existing API
   * response standards or conventions.
   *
   * @remarks
   * - Return `null | undefined` to use the default error response body shaper.
   * - The schema is an OpenAPI 3.2 Schema Object, it is downgraded with the rest of the document when an older `version` is requested.
   */
  customErrorResponseBodySchema?: Value<
    JsonSchema | undefined | null,
    [definedErrors: OpenAPIErrorBodyDefinition[], status: number]
  >

  /**
   * Mapping ORPCError Code -> HTTP Status Code
   *
   * @default COMMON_ERROR_STATUS_MAP
   */
  errorStatusMap?: Record<string, number> | undefined
}

/**
 * Generates an OpenAPI document from a contract or router.
 * Relies on JSON schema converters to translate input, output, and error schemas into JSON Schemas.
 *
 * @see {@link https://orpc.dev/docs/openapi/specification#openapi-generator | OpenAPI Specification - OpenAPI Generator}
 */
export class OpenAPIGenerator {
  private readonly serializer: Public<OpenAPISerializer>
  private readonly converter: Pick<JsonSchemaConverter, 'convert'>

  constructor(options: OpenAPIGeneratorOptions = {}) {
    this.serializer = options.serializer ?? new OpenAPISerializer()
    this.converter = new DelegatingJsonSchemaConverter([
      ...toArray(options.converters),
      new StandardJsonSchemaConverter(),
    ])
  }

  async generate<TVersion extends OpenAPIVersion = '3.2.0'>(
    router: RouterContract | AnyRouter,
    options: OpenAPIGeneratorGenerateOptions<TVersion> = {},
  ): Promise<OpenAPIDocument<TVersion>> {
    const version: OpenAPIVersion = options.version ?? '3.2.0'

    const doc: OpenAPIV3_2.OpenAPIObject = {
      ...clone(options.base),
      openapi: '3.2.0',
      info: options.base?.info ?? { title: 'API Reference', version: '0.0.0' },
    }

    const ctx: OpenAPIOperationContext = {
      registry: new OpenAPIComponentRegistry(doc, options.customComponentName),
      convertSchemas: (schemas, direction) => this.convertSchemas(schemas, direction),
      errorStatusMap: options.errorStatusMap ?? COMMON_ERROR_STATUS_MAP,
      customErrorResponseBodySchema: options.customErrorResponseBodySchema,
    }

    const errors: string[] = []

    await walkProcedureContractsAsync(router, (contract, path) => {
      if (value(options.filter, contract, path) === false) {
        return
      }

      try {
        const def = contract['~orpc']
        const meta = getOpenAPIMeta(contract)

        const method = (meta?.method ?? DEFAULT_OPENAPI_METHOD).toLowerCase() as Lowercase<NonNullable<OpenAPIMeta['method']>>

        if (method === 'query' && !version.startsWith('3.2.')) {
          throw new OpenAPIGeneratorError(
            `QUERY operations require OpenAPI 3.2, but version "${version}" was requested.`,
          )
        }

        const postPath = meta?.path ?? pathToHttpPath(path)
        const httpPath = meta?.prefix ? mergeHttpPath(meta.prefix, postPath) : postPath
        const dynamicPathParams = getDynamicPathParams(httpPath)
        const openApiPath = toOpenAPIPath(httpPath, dynamicPathParams)

        let operation: OpenAPIV3_2.OperationObject

        if (meta?.spec !== undefined && typeof meta.spec !== 'function') {
          operation = meta.spec
        }
        else {
          operation = {
            operationId: meta?.operationId ?? path.join('.'),
            summary: meta?.summary,
            description: meta?.description,
            deprecated: meta?.deprecated,
            tags: meta?.tags?.map(tag => tag),
          }

          buildRequest(ctx, operation, def, meta, dynamicPathParams)
          buildSuccessResponse(ctx, operation, def, meta)
          buildErrorResponse(ctx, operation, def)
        }

        if (typeof meta?.spec === 'function') {
          operation = meta.spec(operation)
        }

        doc.paths ??= {}
        doc.paths[openApiPath] ??= {}
        doc.paths[openApiPath][method] = operation
      }
      catch (e) {
        if (!(e instanceof OpenAPIGeneratorError)) {
          throw e
        }
        errors.push(`Procedure at ${path.join('.') || '(root)'}: ${e.message}`)
      }
    })

    if (errors.length) {
      throw new OpenAPIGeneratorError(
        `[OpenAPIGenerator] Failed to generate the OpenAPI document (${errors.length} error${errors.length === 1 ? '' : 's'}):\n\n${errors.join('\n\n')}`,
      )
    }

    const versioned = toVersionedOpenAPIDocument(doc, version)
    return this.serializer.serialize(versioned, { asFormData: false, useFormDataForBlobFields: false }) as OpenAPIDocument<TVersion>
  }

  private convertSchema(schema: AnySchema | undefined, direction: JsonSchemaConverterDirection): [JsonSchema, boolean] {
    const [jsonSchema, optional] = this.converter.convert(schema as any, direction)
    // composing or hoisting would retarget root-relative refs (`#`, `#/properties/...`),
    // so move a schema that points into itself under a def first
    return [hoistRecursiveRefToDef(strip$schemaField(jsonSchema)), optional]
  }

  private convertSchemas(schemas: AnySchema[] | undefined, direction: JsonSchemaConverterDirection): [JsonSchema, boolean] {
    if (!schemas || schemas.length <= 1) {
      return this.convertSchema(schemas?.[0], direction)
    }

    const results = schemas.map(s => this.convertSchema(s, direction))

    return [
      combineJsonSchemasWithComposition('allOf', results.map(([jsonSchema]) => jsonSchema)),
      results.every(([, optional]) => optional),
    ]
  }
}

function toVersionedOpenAPIDocument(doc: OpenAPIV3_2.OpenAPIObject, version: OpenAPIVersion): OpenAPIDocument<OpenAPIVersion> {
  const downgraded = version.startsWith('3.2.')
    ? doc
    : version.startsWith('3.1.')
      ? downgradeSpecV32ToV31(doc)
      : downgradeSpecV31ToV30(downgradeSpecV32ToV31(doc))

  return { ...downgraded, openapi: version } as OpenAPIDocument<OpenAPIVersion>
}

function strip$schemaField(schema: JsonSchema): JsonSchema {
  if (typeof schema !== 'object') {
    return schema
  }
  const { $schema, ...rest } = schema
  return rest
}
