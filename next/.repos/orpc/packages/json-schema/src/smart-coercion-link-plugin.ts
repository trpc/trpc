import type { ClientContext } from '@orpc/client'
import type { StandardLinkOptions, StandardLinkPlugin } from '@orpc/client/standard'
import type { AnySchema, ErrorMap, RouterContract } from '@orpc/contract'
import type { JsonSchemaCoercerOptions } from './coercer'
import type { JsonSchemaConverter } from './convert'
import type { JsonSchema } from './types'
import { cloneORPCError, ORPCError } from '@orpc/client'
import { getProcedureContractOrThrow } from '@orpc/contract'
import { getOwn, toArray } from '@orpc/shared'
import { JsonSchemaCoercer } from './coercer'
import { DelegatingJsonSchemaConverter } from './convert'
import { StandardJsonSchemaConverter } from './standard-json-schema-converter'

export interface SmartCoercionLinkPluginOptions extends JsonSchemaCoercerOptions {
  converters?: undefined | JsonSchemaConverter[]
}

/**
 * Coerces server responses to match the expected `.output` or `.errors` schema types before validation,
 * based on JSON schemas produced by the configured converters.
 *
 * @see {@link https://orpc.dev/docs/plugins/smart-coercion | Smart Coercion Plugin}
 */
export class SmartCoercionLinkPlugin<T extends ClientContext> implements StandardLinkPlugin<T> {
  name = '~smart-coercion'

  /**
   * Output and error values should be coerced before validation.
   */
  after = ['~response-validation']

  private readonly converter: DelegatingJsonSchemaConverter
  private readonly coercer: JsonSchemaCoercer
  private readonly cache: WeakMap<AnySchema, [JsonSchema, optional: boolean]> = new WeakMap()

  constructor(
    private readonly contract: RouterContract,
    options: SmartCoercionLinkPluginOptions = {},
  ) {
    this.converter = new DelegatingJsonSchemaConverter([
      ...toArray(options.converters),
      new StandardJsonSchemaConverter(),
    ])
    this.coercer = new JsonSchemaCoercer(options)
  }

  init(options: StandardLinkOptions<T>): StandardLinkOptions<T> {
    return {
      ...options,
      interceptors: [
        ...toArray(options.interceptors),
        async ({ next, path }) => {
          const procedure = getProcedureContractOrThrow(this.contract, path)

          try {
            const output = await next()
            const outputSchemas = procedure['~orpc'].outputSchemas

            if (!outputSchemas) {
              return output
            }

            const coercedOutput = this.coerceValue(outputSchemas, output)
            return coercedOutput
          }
          catch (error) {
            if (!(error instanceof ORPCError) || !error.defined) {
              throw error
            }

            const errorMap: ErrorMap = procedure['~orpc'].errorMap
            const dataSchema = getOwn(errorMap, error.code)?.data

            if (!dataSchema) {
              throw error
            }

            const cloned = cloneORPCError(error)
            cloned.data = this.coerceValue([dataSchema], cloned.data)
            throw cloned
          }
        },
      ],
    }
  }

  private coerceValue(schemas: AnySchema[], value: unknown): unknown {
    for (const schema of schemas) {
      let converted = this.cache.get(schema)

      if (!converted) {
        converted = this.converter.convert(schema, 'output')
        this.cache.set(schema, converted)
      }

      value = this.coercer.coerce(converted, value)
    }

    return value
  }
}
