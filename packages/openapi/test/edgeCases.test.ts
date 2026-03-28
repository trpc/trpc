import * as path from 'node:path';
import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { generateOpenAPIDocument } from '../src/generate';
import type { Document } from '../src/types';
import type {
  ConflictingIntersectionResponses,
  DisjointIntersectionResponses,
} from './routers/edgeCaseRouter-heyapi/types.gen';
import {
  getParameter,
  getRequestBody,
  requireOperation,
  requireOutputData,
  requireProperty,
  requireResponseSchema,
  requireSchemaObject,
} from './types';
import { validateOpenApi } from './validateOpenApi';

const routersDir = path.resolve(__dirname, 'routers');
const edgeCaseRouterPath = path.resolve(routersDir, 'edgeCaseRouter.ts');
const appRouterPath = path.resolve(routersDir, 'appRouter.ts');

describe('generateOpenAPIDocument edge cases', () => {
  let doc: Document;

  beforeAll(async () => {
    doc = await generateOpenAPIDocument(edgeCaseRouterPath, {
      exportName: 'EdgeCaseRouter',
      title: 'Edge Case API',
      version: '1.0.0',
    });
  });

  it('produces a valid OpenAPI document', async () => {
    const spec = JSON.stringify(doc, null, 2);
    const problems = await validateOpenApi(spec);

    expect(JSON.stringify(problems, null, 2)).toEqual('[]');
  });

  it('handles bigint types as integer schema', () => {
    const schema = requireOutputData({ doc, procPath: 'bigint' });
    expect(requireProperty(schema, 'id')).toEqual({
      type: 'integer',
      format: 'bigint',
    });
  });

  it('handles never type in optional fields', () => {
    const schema = requireOutputData({ doc, procPath: 'neverField' });
    expect(requireProperty(schema, 'valid')).toEqual({ type: 'string' });
    // `impossible?: never` is typed as `never | undefined` which collapses to
    // an empty schema `{}` (undefined is stripped, never maps to `not: {}`
    // but the union with undefined may simplify).  Just verify it exists and
    // doesn't break the schema.
    expect(schema.properties).toHaveProperty('impossible');
  });

  it('unwraps Promise<T> return types', () => {
    const schema = requireOutputData({ doc, procPath: 'asyncReturn' });
    expect(requireProperty(schema, 'data')).toEqual({ type: 'string' });
  });

  it('handles void/undefined inputs as no parameters', () => {
    const voidOp = requireOperation(doc, 'voidInput');
    expect(voidOp.parameters).toBeUndefined();

    const undefinedOp = requireOperation(doc, 'undefinedInput');
    expect(undefinedOp.parameters).toBeUndefined();

    const voidExplicitOp = requireOperation(doc, 'voidExplicit');
    expect(voidExplicitOp.parameters).toBeUndefined();
  });

  it('excludes subscriptions from OpenAPI paths', () => {
    expect(doc.paths?.['/sub']).toBeUndefined();
  });

  it('does not emit component schemas for excluded subscription procedures', () => {
    expect(doc.components?.schemas?.['AsyncIterable']).toBeUndefined();
  });

  it('handles deeply nested routers', () => {
    expect(doc.paths?.['/level1.level2.level3.deep']).toBeDefined();
    const op = requireOperation(doc, 'level1.level2.level3.deep');
    expect(op.operationId).toBe('level1.level2.level3.deep');
  });

  it('collapses true | false union to boolean', () => {
    const schema = requireOutputData({ doc, procPath: 'boolUnion' });
    expect(requireProperty(schema, 'flag')).toEqual({ type: 'boolean' });
  });

  it('handles boolean | null', () => {
    const schema = requireOutputData({ doc, procPath: 'boolNullable' });
    expect(requireProperty(schema, 'flag')).toEqual({
      type: ['boolean', 'null'],
    });
  });

  it('handles null-only return', () => {
    const schema = requireOutputData({ doc, procPath: 'nullOnly' });
    expect(schema).toEqual({ type: 'null' });
  });

  it('handles Uint8Array as binary format', () => {
    const schema = requireOutputData({ doc, procPath: 'binary' });
    expect(requireProperty(schema, 'data')).toEqual({
      type: 'string',
      format: 'binary',
    });
  });

  it('handles nullable objects in oneOf', () => {
    const schema = requireOutputData({ doc, procPath: 'nullableObject' });
    // Should be oneOf: [objectSchema, { type: "null" }] or type: ["object", "null"]
    expect(JSON.stringify(schema)).toContain('null');
  });

  it('handles mutations with no input', () => {
    const op = requireOperation(doc, 'noInputMutation', 'post');
    expect(op).toBeDefined();
    expect(op.requestBody).toBeUndefined();
  });

  it('handles complex nullable union (string | number | null)', () => {
    const schema = requireOutputData({ doc, procPath: 'complexNullable' });
    const valueSchema = requireProperty(schema, 'value');
    // Should have string, number, and null represented
    const serialized = JSON.stringify(valueSchema);
    expect(serialized).toContain('string');
    expect(serialized).toContain('number');
    expect(serialized).toContain('null');
  });

  it('merges disjoint intersection into a single object schema', () => {
    // Verify the generated client type is a flat object with both properties
    type DisjointData = DisjointIntersectionResponses[200]['result']['data'];
    expectTypeOf<DisjointData>().toEqualTypeOf<{
      name: string;
      age: number;
    }>();

    // Verify the OpenAPI schema is a merged object, not allOf
    const schema = requireOutputData({
      doc,
      procPath: 'disjointIntersection',
    });
    expect(schema.type).toBe('object');
    expect(schema).not.toHaveProperty('allOf');
    expect(requireProperty(schema, 'name')).toEqual({ type: 'string' });
    expect(requireProperty(schema, 'age')).toEqual({ type: 'number' });
    expect(schema.required).toContain('name');
    expect(schema.required).toContain('age');
  });

  it('uses allOf for intersection with conflicting property types', () => {
    // Verify the generated client type preserves the intersection via allOf
    type ConflictingData =
      ConflictingIntersectionResponses[200]['result']['data'];
    expectTypeOf<ConflictingData>().toHaveProperty('id');
    expectTypeOf<ConflictingData>().toHaveProperty('label');
    expectTypeOf<ConflictingData>().toHaveProperty('extra');
    // Both sides of the intersection contribute their `id` type
    expectTypeOf<
      { id: string; label: string } & { id: number; extra: boolean }
    >().toEqualTypeOf<ConflictingData>();

    // Verify the OpenAPI schema uses allOf to preserve both definitions
    const schema = requireOutputData({
      doc,
      procPath: 'conflictingIntersection',
    });
    expect(schema).toHaveProperty('allOf');
    expect(schema).not.toHaveProperty('type');
    expect(schema.allOf).toHaveLength(2);

    // Both schemas in allOf should retain their own definition of `id`
    const idTypes =
      schema.allOf?.map((part, index) => {
        const partSchema = requireSchemaObject(
          part,
          doc,
          `conflictingIntersection.allOf[${index}]`,
        );
        const idSchema = requireSchemaObject(
          requireProperty(partSchema, 'id'),
          doc,
          `conflictingIntersection.allOf[${index}].id`,
        );
        return idSchema.type;
      }) ?? [];
    expect(idTypes).toContain('string');
    expect(idTypes).toContain('number');
  });

  it('assigns correct tags based on top-level procedure path', () => {
    const op = requireOperation(doc, 'level1.level2.level3.deep');
    expect(op.tags).toEqual(['level1']);

    const simpleOp = requireOperation(doc, 'simpleQuery');
    expect(simpleOp.tags).toEqual(['simpleQuery']);
  });

  it('sets default error response reference', () => {
    const op = requireOperation(doc, 'simpleQuery');
    expect(op.responses?.['default']).toEqual({
      $ref: '#/components/responses/Error',
    });
  });

  it('omits compiler-internal symbol keys from schemas', () => {
    expect(JSON.stringify(doc)).not.toMatch(/__@.*@\d+/);
  });

  it('preserves literal computed property names in output schemas', () => {
    const schema = requireOutputData({
      doc,
      procPath: 'literalComputedKey',
    });

    expect(requireProperty(schema, 'x-trace-id')).toEqual({ type: 'string' });
    expect(schema.required).toContain('x-trace-id');
  });
});

describe('generateOpenAPIDocument default options', () => {
  let doc: Document;

  beforeAll(async () => {
    doc = await generateOpenAPIDocument(appRouterPath);
  });

  it('produces a valid OpenAPI document', async () => {
    const spec = JSON.stringify(doc, null, 2);
    const problems = await validateOpenApi(spec);

    expect(JSON.stringify(problems, null, 2)).toEqual('[]');
  });

  it('uses default title and version when not provided', () => {
    expect(doc.info.title).toBe('tRPC API');
    expect(doc.info.version).toBe('0.0.0');
  });

  it('uses default exportName AppRouter', () => {
    // appRouter.ts exports AppRouter, so default should work
    expect(doc.paths).toHaveProperty('/greeting');
  });

  it('wraps output in success envelope correctly', () => {
    const responseSchema = requireSchemaObject(
      requireResponseSchema({ doc, procPath: 'greeting' }),
      doc,
      'greeting response',
    );

    // Should have result.data envelope
    expect(responseSchema.type).toBe('object');
    expect(responseSchema.required).toContain('result');
    const resultSchema = requireSchemaObject(
      requireProperty(responseSchema, 'result'),
      doc,
      'greeting result',
    );
    expect(resultSchema.type).toBe('object');
    expect(resultSchema.required).toContain('data');
  });

  it('wraps output without data for void procedures', () => {
    const responseSchema = requireSchemaObject(
      requireResponseSchema({
        doc,
        procPath: 'inferredReturns.voidReturn',
        method: 'post',
      }),
      doc,
      'inferredReturns.voidReturn response',
    );

    // Should have result but no data
    expect(responseSchema.type).toBe('object');
    expect(responseSchema.required).toContain('result');
    // result.properties should not have data (or data should be empty)
    const resultSchema = requireSchemaObject(
      requireProperty(responseSchema, 'result'),
      doc,
      'inferredReturns.voidReturn result',
    );
    const resultProps = resultSchema.properties ?? {};
    expect(resultProps['data']).toBeUndefined();
  });

  it('puts query input with deepObject style for GET', () => {
    const param = getParameter(doc, 'greeting');
    if (!param) {
      throw new Error('Expected greeting input parameter');
    }

    expect(param.name).toBe('input');
    expect(param.in).toBe('query');
    expect(param.required).toBe(true);
    expect(param.style).toBe('deepObject');
    expect(param.content?.['application/json']?.schema).toBeDefined();
  });

  it('puts mutation input as requestBody for POST', () => {
    const requestBody = getRequestBody(doc, 'user.create', 'post');
    if (!requestBody) {
      throw new Error('Expected user.create request body');
    }

    expect(requestBody.required).toBe(true);
    expect(requestBody.content?.['application/json']?.schema).toBeDefined();
  });
});

describe('generateOpenAPIDocument error handling', () => {
  it('throws for non-existent file', async () => {
    await expect(
      generateOpenAPIDocument('/non/existent/file.ts'),
    ).rejects.toThrow(/Could not load TypeScript file/);
  });

  it('throws when export name not found', async () => {
    await expect(
      generateOpenAPIDocument(appRouterPath, { exportName: 'Nonexistent' }),
    ).rejects.toThrow(/Nonexistent/);
  });

  it('includes available exports in error message', async () => {
    await expect(
      generateOpenAPIDocument(appRouterPath, { exportName: 'Nonexistent' }),
    ).rejects.toThrow(/Available exports/);
  });
});
