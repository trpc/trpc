import { Schema } from 'effect';
import type { AnySchema } from '../server/schema.ts';

/**
 * A JSON Schema (draft 2020-12, which OpenAPI 3.1 uses).
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type JsonSchema = { readonly [key: string]: unknown } | boolean;

type Convert = (opts: {
  target: string;
  libraryOptions?: Record<string, unknown>;
}) => Record<string, unknown>;

interface StandardJsonSchema {
  readonly '~standard': {
    readonly jsonSchema?: { readonly input: Convert; readonly output: Convert };
  };
}

/**
 * The JSON Schema of what a schema accepts (`'input'`) or produces
 * (`'output'`), through [Standard JSON Schema](https://standardschema.dev/json-schema).
 * Effect Schemas go through `Schema.toStandardJSONSchemaV1`. `undefined` when
 * the library can't describe the schema. Values JSON Schema can't represent
 * (a `Date`) become `{}`.
 * @internal
 */
export function toJsonSchema(
  schema: AnySchema,
  io: 'input' | 'output',
): Exclude<JsonSchema, boolean> | undefined {
  try {
    const standard = (
      Schema.isSchema(schema) ? Schema.toStandardJSONSchemaV1(schema) : schema
    ) as StandardJsonSchema;
    const convert = standard['~standard'].jsonSchema?.[io];
    if (!convert) return undefined;
    const { $schema: _, ...json } = convert({
      target: 'draft-2020-12',
      libraryOptions: { unrepresentable: 'any' },
    });
    return json;
  } catch {
    return undefined;
  }
}
