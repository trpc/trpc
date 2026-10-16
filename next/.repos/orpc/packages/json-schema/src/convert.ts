import type { AnySchema } from '@orpc/contract'
import type { JsonSchema } from './types'

/**
 * The conversion direction: `input` targets the schema's input type, `output` targets its output type.
 *
 * @see {@link https://orpc.dev/docs/integrations/standard-schema | Standard Schema Integration}
 */
export type JsonSchemaConverterDirection = 'input' | 'output'

/**
 * Interface for converting validation schemas into JSON Schema representations,
 * used by tools such as the OpenAPI Generator and Smart Coercion plugins.
 *
 * @see {@link https://orpc.dev/docs/integrations/standard-schema | Standard Schema Integration}
 */
export interface JsonSchemaConverter {
  /**
   * Determines whether this converter can handle the given schema.
   */
  condition(schema: AnySchema | undefined, direction: JsonSchemaConverterDirection): boolean

  /**
   * Converts an ORPC schema to a JSON Schema representation.
   */
  convert(schema: AnySchema | undefined, direction: JsonSchemaConverterDirection): [jsonSchema: JsonSchema, optional: boolean]
}

export class DelegatingJsonSchemaConverter implements Pick<JsonSchemaConverter, 'convert'> {
  constructor(
    private readonly converters: JsonSchemaConverter[] = [],
  ) {}

  convert(schema: AnySchema | undefined, direction: JsonSchemaConverterDirection): [jsonSchema: JsonSchema, optional: boolean] {
    for (const converter of this.converters) {
      if (converter.condition(schema, direction)) {
        return converter.convert(schema, direction)
      }
    }

    return [{}, true]
  }
}
