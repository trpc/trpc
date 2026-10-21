/**
 * What a registry gives an OpenAPI document: one component schema per
 * error, written once and referenced, and one response per status listing
 * the errors with it. Today each operation inlines its declared errors.
 */
import { Schema } from 'effect';
import type { AnySchema } from '@trpc12/trpc/server';
import type { AnyErrorMaker } from './define.ts';

type JsonSchema = Record<string, unknown>;

const dataSchema = (schema: AnySchema): JsonSchema => {
  if (Schema.isSchema(schema)) {
    return Schema.toJsonSchemaDocument(schema).schema as JsonSchema;
  }
  const standard = schema['~standard'] as {
    jsonSchema?: { output: (opts: { target: string }) => JsonSchema };
  };
  return standard.jsonSchema?.output({ target: 'draft-2020-12' }) ?? {};
};

/** An error's OpenAPI body: its tag as a `const`, its message and its `data`. */
export const errorSchema = (error: {
  readonly tag: string;
  readonly data: AnySchema | undefined;
}): JsonSchema => ({
  type: 'object',
  properties: {
    tag: { const: error.tag },
    message: { type: 'string' },
    ...(error.data === undefined ? {} : { data: dataSchema(error.data) }),
  },
  required: ['tag', 'message', ...(error.data === undefined ? [] : ['data'])],
});

export interface OpenApiErrors {
  readonly schemas: Record<string, JsonSchema>;
  /** By status: what an operation that can fail with these lists. */
  readonly responses: Record<
    string,
    {
      readonly description: string;
      readonly content: {
        readonly 'application/json': { readonly schema: JsonSchema };
      };
    }
  >;
}

/** `components.schemas` and the responses for `errors`, skipping client-side ones. */
export function errorsToOpenApi(
  errors: ReadonlyArray<{
    readonly tag: string;
    readonly data: AnySchema | undefined;
    readonly status: number;
    readonly description?: string | undefined;
  }>,
): OpenApiErrors {
  const sent = errors.filter(
    (e) => e.status >= 400 && e.status < 600 && e.status !== 499,
  );
  const schemas = Object.fromEntries(sent.map((e) => [e.tag, errorSchema(e)]));
  const statuses = [...new Set(sent.map((e) => e.status))].sort(
    (a, b) => a - b,
  );
  const responses = Object.fromEntries(
    statuses.map((status) => {
      const members = sent.filter((e) => e.status === status);
      const refs = members.map((e) => ({
        $ref: `#/components/schemas/${e.tag}`,
      }));
      return [
        String(status),
        {
          description: members.map((e) => e.description ?? e.tag).join(' | '),
          content: {
            'application/json': {
              schema: refs.length === 1 ? refs[0]! : { oneOf: refs },
            },
          },
        },
      ];
    }),
  );
  return { schemas, responses };
}

/** {@link errorsToOpenApi} for a registry. */
export const registryToOpenApi = (
  registry: Readonly<Record<string, AnyErrorMaker>>,
): OpenApiErrors =>
  errorsToOpenApi(
    Object.values(registry).map((entry) => ({
      tag: entry.tag,
      data: entry.spec.data,
      status: entry.spec.status,
      description: entry.spec.description,
    })),
  );
