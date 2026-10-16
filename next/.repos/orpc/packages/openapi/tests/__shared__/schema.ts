import type { AnySchema } from '@orpc/contract'
import type { JsonSchema, JsonSchemaConverter } from '@orpc/json-schema'
import z from 'zod'

/**
 * Converts zod schemas during tests.
 * The generator itself is schema-agnostic: it only relies on the provided converters,
 * so any standard schema library (zod, arktype, valibot, ...) or even plain JSON schemas
 * (see {@link testSchema}) work the same way.
 */
export const zodJsonSchemaConverter: JsonSchemaConverter = {
  condition: schema => schema?.['~standard'].vendor === 'zod',
  convert(schema, direction) {
    const jsonSchema = z.toJSONSchema(schema as any, { io: direction })
    const output = schema?.['~standard'].validate(undefined)
    return [jsonSchema as any, !(output instanceof Promise) && !output?.issues]
  },
}

export interface TestSchemaOptions {
  /**
   * Marks the schema as optional (accepts `undefined`).
   */
  optional?: boolean
  /**
   * JSON schema used for the `output` direction. Defaults to the `input` JSON schema.
   */
  output?: JsonSchema
}

/**
 * Creates a schema backed by a plain JSON schema, converted via {@link testSchemaConverter}.
 * Used to test the generator against arbitrary JSON schemas without a schema library.
 */
export function testSchema(jsonSchema: JsonSchema, options: TestSchemaOptions = {}): AnySchema {
  return {
    '~standard': {
      version: 1,
      vendor: 'orpc-test',
      validate: () => ({ issues: [{ message: 'testSchema does not support validation' }] }),
    },
    '~test': {
      input: jsonSchema,
      output: options.output ?? jsonSchema,
      optional: options.optional ?? false,
    },
  } as any
}

export const testSchemaConverter: JsonSchemaConverter = {
  condition: schema => (schema as any)?.['~standard'].vendor === 'orpc-test',
  convert(schema, direction) {
    const detail = (schema as any)['~test']
    return [detail[direction], detail.optional]
  },
}
