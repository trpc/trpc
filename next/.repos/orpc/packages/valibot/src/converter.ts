import type { AnySchema, JsonSchema, JsonSchemaConverter, JsonSchemaConverterDirection } from '@orpc/json-schema'
import type { ConversionConfig, ConversionContext, OverrideSchemaContext, JsonSchema as ValibotJsonSchema } from '@valibot/to-json-schema'
import type { BaseSchema, MapSchema, SetSchema } from 'valibot'
import { isStandardSchemaOptional, JsonSchemaFormat, JsonSchemaXNativeType } from '@orpc/json-schema'
import { toJsonSchema } from '@valibot/to-json-schema'
import { any, tuple } from 'valibot'

export interface ValibotToJsonSchemaConverterOptions extends Omit<ConversionConfig, 'target' | 'typeMode' | 'overrideRef'> {
  /**
   * Caches conversion results in a WeakMap keyed by the Valibot schema instance,
   * so converting the same schema again is free.
   *
   * When enabled, repeated conversions return the same JSON schema object,
   * so treat returned schemas as immutable.
   *
   * @default false
   */
  cache?: boolean
}

const NESTED_CONVERSION_SENTINEL = any()

/**
 * Converts Valibot schemas into JSON Schema using Valibot's built-in `toJsonSchema`,
 * with additional support for types such as `v.bigint()`, `v.date()`, `v.set()`, and `v.map()`.
 *
 * @see {@link https://orpc.dev/docs/integrations/valibot | Valibot Integration}
 */
export class ValibotToJsonSchemaConverter implements JsonSchemaConverter {
  private readonly conversionConfig: ConversionConfig
  private readonly cache: undefined | { [d in JsonSchemaConverterDirection]: WeakMap<BaseSchema<any, any, any>, [jsonSchema: JsonSchema, optional: boolean]> }

  constructor(
    { cache, ...conversionConfig }: ValibotToJsonSchemaConverterOptions = {},
  ) {
    this.conversionConfig = conversionConfig

    if (cache) {
      this.cache = { input: new WeakMap(), output: new WeakMap() }
    }
  }

  condition(schema: AnySchema | undefined, _direction: JsonSchemaConverterDirection): boolean {
    return schema?.['~standard'].vendor === 'valibot'
  }

  convert(schema: AnySchema | undefined, direction: JsonSchemaConverterDirection): [jsonSchema: JsonSchema, optional: boolean] {
    const valibotSchema = schema as BaseSchema<any, any, any>

    if (this.cache) {
      const cached = this.cache[direction].get(valibotSchema)
      if (cached) {
        return cached
      }
    }

    const result = this.convertUncached(valibotSchema, direction)

    if (this.cache) {
      this.cache[direction].set(valibotSchema, result)
    }

    return result
  }

  private convertUncached(valibotSchema: BaseSchema<any, any, any>, direction: JsonSchemaConverterDirection): [jsonSchema: JsonSchema, optional: boolean] {
    // Since the default oRPC format is always draft/2020-12,
    // `$schema` can be safely omitted here.
    const { $schema, ...jsonSchema } = toJsonSchema(valibotSchema, this.createConversionConfig(direction))

    return [jsonSchema as JsonSchema, isStandardSchemaOptional(valibotSchema, direction)]
  }

  private createConversionConfig(direction: JsonSchemaConverterDirection): ConversionConfig {
    return {
      errorMode: 'ignore',
      ...this.conversionConfig,
      target: 'draft-2020-12',
      typeMode: direction,
      overrideSchema: context => this.overrideSchema(context, direction),
    }
  }

  private overrideSchema(context: OverrideSchemaContext, direction: JsonSchemaConverterDirection): ValibotJsonSchema | null | undefined {
    const jsonSchema = this.convertNativeType(context, direction)

    return jsonSchema
      ? this.conversionConfig.overrideSchema?.({ ...context, jsonSchema, errors: undefined }) ?? jsonSchema
      : this.conversionConfig.overrideSchema?.(context)
  }

  private convertNativeType(context: OverrideSchemaContext, direction: JsonSchemaConverterDirection): ValibotJsonSchema | undefined {
    switch (context.valibotSchema.type) {
      case 'bigint':
        return { 'type': 'string', 'pattern': '^-?[0-9]+$', 'x-native-type': JsonSchemaXNativeType.BigInt } as ValibotJsonSchema
      case 'date':
        return { 'type': 'string', 'format': JsonSchemaFormat.DateTime, 'x-native-type': JsonSchemaXNativeType.Date } as ValibotJsonSchema
      case 'set': {
        const { value } = context.valibotSchema as SetSchema<BaseSchema<any, any, any>, any>
        return { 'type': 'array', 'uniqueItems': true, 'items': this.convertWithin(context, [value], direction)[0], 'x-native-type': JsonSchemaXNativeType.Set } as ValibotJsonSchema
      }
      case 'map': {
        const { key, value } = context.valibotSchema as MapSchema<BaseSchema<any, any, any>, BaseSchema<any, any, any>, any>
        return {
          'type': 'array',
          'items': { type: 'array', prefixItems: this.convertWithin(context, [key, value], direction), maxItems: 2, minItems: 2 },
          'x-native-type': JsonSchemaXNativeType.Map,
        } as ValibotJsonSchema
      }
    }
  }

  private convertWithin(
    parent: ConversionContext,
    schemas: BaseSchema<any, any, any>[],
    direction: JsonSchemaConverterDirection,
  ): ValibotJsonSchema[] {
    // Relies on `@valibot/to-json-schema` converting tuple items in order,
    // so the sentinel adopts the parent state before any of `schemas` converts.
    const wrapper = tuple([NESTED_CONVERSION_SENTINEL, ...schemas])
    let child!: ConversionContext

    const { prefixItems } = toJsonSchema(wrapper, {
      ...this.createConversionConfig(direction),
      definitions: {},
      overrideSchema: (context) => {
        if (context.valibotSchema === NESTED_CONVERSION_SENTINEL) {
          child = context
          mergeConversionContext(child, parent)
        }
        else if (context.valibotSchema !== wrapper) {
          return this.overrideSchema(context, direction)
        }
      },
    })

    mergeConversionContext(parent, child)

    return prefixItems!.slice(1) as ValibotJsonSchema[]
  }
}

function mergeConversionContext(target: ConversionContext, source: ConversionContext): void {
  // Assumes `@valibot/to-json-schema` only records lazy getters and definitions along with a reference.
  if (!source.referenceMap.size) {
    return
  }

  source.referenceMap.forEach((referenceId, schema) => target.referenceMap.set(schema, referenceId))
  source.getterMap.forEach((schema, getter) => target.getterMap.set(getter, schema))
  Object.assign(target.definitions, source.definitions)
}
