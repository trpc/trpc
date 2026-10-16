import type { AnySchema } from '@orpc/contract'
import type { JsonSchema, JsonSchemaConverter, JsonSchemaConverterDirection } from '@orpc/json-schema'
import { isStandardSchemaOptional } from '@orpc/json-schema'
import { Schema as EffectSchema } from 'effect'

export interface EffectSchemaToJsonSchemaConverterOptions extends EffectSchema.ToJsonSchemaOptions {
  /**
   * Caches conversion results in a WeakMap keyed by the Effect schema instance,
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
 * Converts Effect schemas into JSON Schema using Effect's built-in
 * [`Schema.toJsonSchemaDocument`](https://effect.website/docs/schema/json-schema/).
 * Useful with tools such as the OpenAPI Generator.
 *
 * @see {@link https://orpc.dev/docs/integrations/effect#json-schema-converter | Effect Integration - JSON Schema Converter}
 */
export class EffectSchemaToJsonSchemaConverter implements JsonSchemaConverter {
  private readonly toJsonSchemaOptions: EffectSchema.ToJsonSchemaOptions
  private readonly cache: undefined | { [d in JsonSchemaConverterDirection]: WeakMap<EffectSchema.Top, [jsonSchema: JsonSchema, optional: boolean]> }

  constructor({ cache, ...toJsonSchemaOptions }: EffectSchemaToJsonSchemaConverterOptions = {}) {
    this.toJsonSchemaOptions = toJsonSchemaOptions

    if (cache) {
      this.cache = { input: new WeakMap(), output: new WeakMap() }
    }
  }

  condition(schema: AnySchema | undefined, _direction: JsonSchemaConverterDirection): boolean {
    return schema?.['~standard'].vendor === 'effect' && EffectSchema.isSchema(schema)
  }

  convert(schema: AnySchema | undefined, direction: JsonSchemaConverterDirection): [jsonSchema: JsonSchema, optional: boolean] {
    const effectSchema = schema as EffectSchema.Top & AnySchema

    if (this.cache) {
      const cached = this.cache[direction].get(effectSchema)
      if (cached) {
        return cached
      }
    }

    const result = this.convertUncached(effectSchema, direction)

    if (this.cache) {
      this.cache[direction].set(effectSchema, result)
    }

    return result
  }

  private convertUncached(schema: EffectSchema.Top & AnySchema, direction: JsonSchemaConverterDirection): [jsonSchema: JsonSchema, optional: boolean] {
    return [this.convertEffect(schema, direction), isStandardSchemaOptional(schema, direction)]
  }

  private convertEffect(schema: EffectSchema.Top, direction: JsonSchemaConverterDirection): JsonSchema {
    const { schema: jsonSchema, definitions } = EffectSchema.toJsonSchemaDocument(
      direction === 'input' ? schema : EffectSchema.toType(schema),
      this.toJsonSchemaOptions,
    )

    return (Object.keys(definitions).length > 0 ? { ...jsonSchema, $defs: definitions } : jsonSchema) as JsonSchema
  }
}
