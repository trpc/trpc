import type { AnySchema } from '@orpc/contract'
// eslint-disable-next-line no-restricted-imports
import type { StandardJSONSchemaV1 } from '@standard-schema/spec'
import type { JsonSchemaConverter, JsonSchemaConverterDirection } from './convert'
import type { JsonSchema } from './types'
import { isTypescriptObject } from '@orpc/shared'

/**
 * Returns true when the schema accepts `undefined` in the given direction,
 * found by validating `undefined` against it. For `output`, the validated value must also be `undefined`.
 *
 * Returns false when validation throws or is async. An async result is never left as an unhandled rejection.
 */
export function isStandardSchemaOptional(schema: AnySchema, direction: JsonSchemaConverterDirection): boolean {
  try {
    const result = schema['~standard'].validate(undefined)

    if (result instanceof Promise) {
      result.catch(() => {})
      return false
    }

    return !result.issues && (direction === 'input' || result.value === undefined)
  }
  catch {
    return false
  }
}

export class StandardJsonSchemaConverter implements JsonSchemaConverter {
  condition(schema: AnySchema | undefined, _direction: JsonSchemaConverterDirection): boolean {
    return Boolean(
      schema
      && 'jsonSchema' in schema['~standard']
      && isTypescriptObject(schema['~standard'].jsonSchema)
      && 'input' in schema['~standard'].jsonSchema
      && typeof schema['~standard'].jsonSchema.input === 'function'
      && 'output' in schema['~standard'].jsonSchema
      && typeof schema['~standard'].jsonSchema.output === 'function',
    )
  }

  convert(schema: AnySchema | undefined, direction: JsonSchemaConverterDirection): [jsonSchema: JsonSchema, optional: boolean] {
    return this.convertInternal(schema as any, direction)
  }

  convertInternal(schema: StandardJSONSchemaV1 & AnySchema, direction: JsonSchemaConverterDirection): [jsonSchema: JsonSchema, optional: boolean] {
    try {
      const jsonSchema = direction === 'input'
        ? schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' })
        : schema['~standard'].jsonSchema.output({ target: 'draft-2020-12' })

      return [jsonSchema, isStandardSchemaOptional(schema, direction)]
    }
    catch {
      return [{}, true]
    }
  }
}
