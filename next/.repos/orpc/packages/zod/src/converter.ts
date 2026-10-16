import type { AnySchema, JsonSchema, JsonSchemaConverter, JsonSchemaConverterDirection } from '@orpc/json-schema'
import type { $ZodType, $ZodTypes, ToJSONSchemaContext, ToJSONSchemaParams, JSONSchema as ZodJsonSchema } from 'zod/v4/core'
import { isStandardSchemaOptional, JsonSchemaFormat, JsonSchemaXNativeType } from '@orpc/json-schema'
import { process as processZodSchema, toJSONSchema } from 'zod/v4/core'
import { JSON_SCHEMA_INPUT_REGISTRY, JSON_SCHEMA_OUTPUT_REGISTRY, JSON_SCHEMA_REGISTRY } from './registries'

export interface ZodToJsonSchemaConverterOptions extends Omit<ToJSONSchemaParams, 'target' | 'io'> {
  /**
   * Caches conversion results in a WeakMap keyed by the Zod schema instance,
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
 * Converts Zod schemas into JSON Schema using Zod's built-in `toJSONSchema`,
 * with additional support for types such as `z.bigint()`, `z.date()`, `z.set()`, and `z.map()`.
 *
 * @see {@link https://orpc.dev/docs/integrations/zod | Zod Integration}
 */
export class ZodToJsonSchemaConverter implements JsonSchemaConverter {
  private readonly toJSONSchemaParams: ToJSONSchemaParams
  private readonly cache: undefined | { [d in JsonSchemaConverterDirection]: WeakMap<$ZodType, [jsonSchema: JsonSchema, optional: boolean]> }

  constructor(
    { cache, ...toJSONSchemaParams }: ZodToJsonSchemaConverterOptions = {},
  ) {
    this.toJSONSchemaParams = toJSONSchemaParams

    if (cache) {
      this.cache = { input: new WeakMap(), output: new WeakMap() }
    }
  }

  condition(schema: AnySchema | undefined, _direction: JsonSchemaConverterDirection): boolean {
    return schema?.['~standard'].vendor === 'zod'
  }

  convert(schema: AnySchema | undefined, direction: JsonSchemaConverterDirection): [jsonSchema: JsonSchema, optional: boolean] {
    const zodSchema = schema as $ZodType

    if (this.cache) {
      const cached = this.cache[direction].get(zodSchema)
      if (cached) {
        return cached
      }
    }

    const result = this.convertUncached(zodSchema, direction)

    if (this.cache) {
      this.cache[direction].set(zodSchema, result)
    }

    return result
  }

  private convertUncached(zodSchema: $ZodType, direction: JsonSchemaConverterDirection): [jsonSchema: JsonSchema, optional: boolean] {
    const jsonSchema = this.convertZod(zodSchema, direction)

    return [jsonSchema as JsonSchema, isStandardSchemaOptional(zodSchema, direction)]
  }

  private convertZod(schema: $ZodType, direction: JsonSchemaConverterDirection): ZodJsonSchema.JSONSchema {
    const { unrepresentable = 'any' } = this.toJSONSchemaParams

    const jsonSchema = toJSONSchema(schema, {
      ...this.toJSONSchemaParams,
      target: 'draft-2020-12',
      io: direction,
      unrepresentable(this: ToJSONSchemaContext, info) {
        return convertNativeType(this, info.zodSchema, info.path)
          ?? (typeof unrepresentable === 'function' ? unrepresentable(info) : unrepresentable)
      },
      override: (ctx) => {
        const customJsonSchema = this.getCustomJsonSchema(ctx.zodSchema, direction)

        if (customJsonSchema) {
          Object.assign(ctx.jsonSchema, customJsonSchema)
        }

        this.toJSONSchemaParams.override?.(ctx)
      },
    })

    // Since the default oRPC format is always draft/2020-12,
    // `$schema` can be safely omitted here.
    const { $schema, ...rest } = jsonSchema

    return rest
  }

  private getCustomJsonSchema(schema: $ZodType, direction: JsonSchemaConverterDirection): Exclude<JsonSchema, boolean> | undefined {
    const general = JSON_SCHEMA_REGISTRY.get(schema)
    const directional = direction === 'input'
      ? JSON_SCHEMA_INPUT_REGISTRY.get(schema)
      : JSON_SCHEMA_OUTPUT_REGISTRY.get(schema)

    if (general === undefined && directional === undefined) {
      return undefined
    }

    return { ...general, ...directional } as Exclude<JsonSchema, boolean>
  }
}

function convertNativeType(
  ctx: ToJSONSchemaContext,
  zodSchema: $ZodTypes,
  path: (string | number)[],
): ZodJsonSchema.BaseSchema | undefined {
  const def = zodSchema._zod.def

  switch (def.type) {
    case 'bigint':
      return { 'type': 'string', 'pattern': '^-?[0-9]+$', 'x-native-type': JsonSchemaXNativeType.BigInt }
    case 'date':
      return { 'type': 'string', 'format': JsonSchemaFormat.DateTime, 'x-native-type': JsonSchemaXNativeType.Date }
    case 'set':
    case 'map': {
      const schemaPath: $ZodType[] = []
      for (const [seenSchema, seen] of ctx.seen) {
        if (seen.path && seen.path.length <= path.length && seen.path.every((segment, i) => segment === path[i])) {
          schemaPath.push(seenSchema)
        }
      }

      const processItems = (schema: $ZodType, ...segments: (string | number)[]) =>
        processZodSchema(schema, ctx, { path: [...path, 'items', ...segments], schemaPath })

      return def.type === 'set'
        ? { 'type': 'array', 'uniqueItems': true, 'items': processItems(def.valueType), 'x-native-type': JsonSchemaXNativeType.Set }
        : {
            'type': 'array',
            'items': {
              type: 'array',
              prefixItems: [processItems(def.keyType, 'prefixItems', 0), processItems(def.valueType, 'prefixItems', 1)],
              maxItems: 2,
              minItems: 2,
            },
            'x-native-type': JsonSchemaXNativeType.Map,
          }
    }
  }
}
