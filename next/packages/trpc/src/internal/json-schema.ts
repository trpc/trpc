import { Schema } from 'effect';
import type { AnySchema } from '../server/validation/index.ts';

/**
 * A JSON Schema (draft 2020-12, which OpenAPI 3.1 uses).
 * @since 0.1.0
 * @stability stable
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
 * the library can't describe the schema. zod's `Date` outputs are
 * `date-time` strings, and `File` or `Blob` inputs are `format: binary`;
 * other values JSON Schema can't represent become `{}`.
 * @since 0.1.0
 * @stability stable
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
      libraryOptions: { unrepresentable: unrepresentable(io) },
    });
    return json;
  } catch {
    return undefined;
  }
}

interface ZodUnrepresentable {
  readonly zodSchema: {
    readonly _zod?: {
      readonly def?: { readonly type?: string; readonly coerce?: boolean };
      readonly bag?: { Class?: unknown };
    };
  };
}

const isBlobClass = (Class: unknown) =>
  typeof Class === 'function' &&
  (Class === Blob || Class.prototype instanceof Blob);

/**
 * zod's `unrepresentable` hook. `z.instanceof(File)` or `Blob` inputs are
 * binary, as forms send them. A `Date` output is the string `toJSON()`
 * gives; as an input, only `z.coerce.date()` accepts that string.
 */
const unrepresentable =
  (io: 'input' | 'output') =>
  (ctx: ZodUnrepresentable): JsonSchema | 'any' => {
    const zod = ctx.zodSchema._zod;
    if (zod?.def?.type === 'date' && (io === 'output' || zod.def.coerce))
      return { type: 'string', format: 'date-time' };
    if (io === 'input' && isBlobClass(zod?.bag?.Class))
      return { type: 'string', format: 'binary' };
    return 'any';
  };
