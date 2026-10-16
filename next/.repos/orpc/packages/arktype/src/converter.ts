import type { JsonSchema as ArkJsonSchema, ToJsonSchema } from '@ark/schema'
import type { AnySchema, JsonSchema, JsonSchemaConverter, JsonSchemaConverterDirection } from '@orpc/json-schema'
import type { Type } from 'arktype'
import { isStandardSchemaOptional, JsonSchemaFormat, JsonSchemaXNativeType } from '@orpc/json-schema'

export interface ArkTypeToJsonSchemaConverterOptions extends Omit<ToJsonSchema.Options, 'dialect' | 'target'> {
  /**
   * Caches conversion results in a WeakMap keyed by the ArkType schema instance,
   * so converting the same schema again is free.
   *
   * When enabled, repeated conversions return the same JSON schema object,
   * so treat returned schemas as immutable.
   *
   * @default false
   */
  cache?: boolean
}

/**
 * Converts ArkType schemas into JSON Schema using ArkType's built-in `toJsonSchema`,
 * with additional support for types such as `bigint` and `Date`.
 *
 * @see {@link https://orpc.dev/docs/integrations/arktype | ArkType Integration}
 */
export class ArkTypeToJsonSchemaConverter implements JsonSchemaConverter {
  private readonly toJsonSchemaOptions: ToJsonSchema.Options
  private readonly cache: undefined | { [d in JsonSchemaConverterDirection]: WeakMap<Type, [jsonSchema: JsonSchema, optional: boolean]> }

  constructor({ cache, ...options }: ArkTypeToJsonSchemaConverterOptions = {}) {
    if (cache) {
      this.cache = { input: new WeakMap(), output: new WeakMap() }
    }

    this.toJsonSchemaOptions = {
      ...options,
      target: 'draft-2020-12',
      fallback: {
        ...(options.fallback && typeof options.fallback !== 'function' ? options.fallback : undefined),
        default: (ctx) => {
          if (ctx.code === 'domain') {
            if (ctx.domain === 'bigint') {
              ;(ctx.base as any).type = 'string'
              ;(ctx.base as any).pattern = '^-?[0-9]+$'
              ;(ctx.base as any)['x-native-type'] = JsonSchemaXNativeType.BigInt
            }
          }
          else if (ctx.code === 'date') {
            ;(ctx.base as any).type = 'string'
            ;(ctx.base as any).format = JsonSchemaFormat.DateTime
            ;(ctx.base as any)['x-native-type'] = JsonSchemaXNativeType.Date
          }

          if (typeof options.fallback === 'function') {
            return options.fallback(ctx)
          }

          if (options.fallback?.default) {
            return options.fallback.default(ctx)
          }

          return ctx.base
        },
      },
    }
  }

  condition(schema: AnySchema | undefined, _direction: JsonSchemaConverterDirection): boolean {
    return schema?.['~standard'].vendor === 'arktype'
  }

  convert(schema: AnySchema | undefined, direction: JsonSchemaConverterDirection): [jsonSchema: JsonSchema, optional: boolean] {
    const arkTypeSchema = schema as Type

    if (this.cache) {
      const cached = this.cache[direction].get(arkTypeSchema)
      if (cached) {
        return cached
      }
    }

    const result = this.convertUncached(arkTypeSchema, direction)

    if (this.cache) {
      this.cache[direction].set(arkTypeSchema, result)
    }

    return result
  }

  private convertUncached(arkTypeSchema: Type, direction: JsonSchemaConverterDirection): [jsonSchema: JsonSchema, optional: boolean] {
    const jsonSchema = this.convertArkType(arkTypeSchema, direction)

    return [jsonSchema as JsonSchema, isStandardSchemaOptional(arkTypeSchema, direction)]
  }

  private convertArkType(schema: Type, direction: JsonSchemaConverterDirection): ArkJsonSchema {
    // `toJsonSchema` describes the input side (and keeps `default` annotations),
    // so output conversions go through `.out` to reflect morph outputs and applied defaults.
    const jsonSchema = (direction === 'output' ? schema.out : schema).toJsonSchema(this.toJsonSchemaOptions)

    // Since the default oRPC format is always draft/2020-12,
    // `$schema` can be safely omitted here.
    const { $schema, ...rest } = jsonSchema
    return rest
  }
}
