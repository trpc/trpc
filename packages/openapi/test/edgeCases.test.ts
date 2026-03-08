import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OpenAPIDocument } from '../src/generate';
import { generateOpenAPIDocument } from '../src/generate';

const routersDir = path.resolve(__dirname, 'routers');
const edgeCaseRouterPath = path.resolve(routersDir, 'edgeCaseRouter.ts');
const appRouterPath = path.resolve(routersDir, 'appRouter.ts');

/** Resolve a schema that may be a $ref into the actual schema object. */
function resolveSchema(schema: any, doc: OpenAPIDocument): any {
  if (!schema?.$ref) return schema;
  const name = schema.$ref.replace('#/components/schemas/', '');
  return (doc.components as any).schemas?.[name] ?? schema;
}

/** Extract the output data schema from the tRPC success envelope. */
function unwrapSuccessData(schema: any, doc: OpenAPIDocument): any {
  const resolved = resolveSchema(schema, doc);
  const dataSchema = resolved?.properties?.result?.properties?.data;
  return dataSchema ? resolveSchema(dataSchema, doc) : undefined;
}

function getResponseSchema(
  doc: OpenAPIDocument,
  procedurePath: string,
  method: 'get' | 'post' = 'get',
): any {
  const op = doc.paths[`/${procedurePath}`]?.[method] as any;
  return op?.responses?.['200']?.content?.['application/json']?.schema;
}

describe('generateOpenAPIDocument edge cases', () => {
  let doc: OpenAPIDocument;

  beforeAll(async () => {
    doc = await generateOpenAPIDocument(edgeCaseRouterPath, {
      exportName: 'EdgeCaseRouter',
      title: 'Edge Case API',
      version: '1.0.0',
    });
  });

  it('handles bigint types as integer schema', () => {
    const schema = unwrapSuccessData(getResponseSchema(doc, 'bigint'), doc);
    expect(schema.properties.id).toEqual({ type: 'integer' });
  });

  it('handles never type in optional fields', () => {
    const schema = unwrapSuccessData(getResponseSchema(doc, 'neverField'), doc);
    expect(schema.properties.valid).toEqual({ type: 'string' });
    // `impossible?: never` is typed as `never | undefined` which collapses to
    // an empty schema `{}` (undefined is stripped, never maps to `not: {}`
    // but the union with undefined may simplify).  Just verify it exists and
    // doesn't break the schema.
    expect(schema.properties).toHaveProperty('impossible');
  });

  it('unwraps Promise<T> return types', () => {
    const schema = unwrapSuccessData(
      getResponseSchema(doc, 'asyncReturn'),
      doc,
    );
    expect(schema.properties.data).toEqual({ type: 'string' });
  });

  it('handles void/undefined inputs as no parameters', () => {
    const voidOp = doc.paths['/voidInput']?.['get'] as any;
    expect(voidOp.parameters).toBeUndefined();

    const undefinedOp = doc.paths['/undefinedInput']?.['get'] as any;
    expect(undefinedOp.parameters).toBeUndefined();

    const voidExplicitOp = doc.paths['/voidExplicit']?.['get'] as any;
    expect(voidExplicitOp.parameters).toBeUndefined();
  });

  it('excludes subscriptions from OpenAPI paths', () => {
    expect(doc.paths['/sub']).toBeUndefined();
  });

  it('handles deeply nested routers', () => {
    expect(doc.paths['/level1.level2.level3.deep']).toBeDefined();
    const op = doc.paths['/level1.level2.level3.deep']?.['get'] as any;
    expect(op.operationId).toBe('level1.level2.level3.deep');
  });

  it('collapses true | false union to boolean', () => {
    const schema = unwrapSuccessData(getResponseSchema(doc, 'boolUnion'), doc);
    expect(schema.properties.flag).toEqual({ type: 'boolean' });
  });

  it('handles boolean | null', () => {
    const schema = unwrapSuccessData(
      getResponseSchema(doc, 'boolNullable'),
      doc,
    );
    expect(schema.properties.flag).toEqual({ type: ['boolean', 'null'] });
  });

  it('handles null-only return', () => {
    const schema = unwrapSuccessData(getResponseSchema(doc, 'nullOnly'), doc);
    expect(schema).toEqual({ type: 'null' });
  });

  it('handles Uint8Array as binary format', () => {
    const schema = unwrapSuccessData(getResponseSchema(doc, 'binary'), doc);
    expect(schema.properties.data).toEqual({
      type: 'string',
      format: 'binary',
    });
  });

  it('handles nullable objects in oneOf', () => {
    const schema = unwrapSuccessData(
      getResponseSchema(doc, 'nullableObject'),
      doc,
    );
    // Should be oneOf: [objectSchema, { type: "null" }] or type: ["object", "null"]
    expect(JSON.stringify(schema)).toContain('null');
  });

  it('handles mutations with no input', () => {
    const op = doc.paths['/noInputMutation']?.['post'] as any;
    expect(op).toBeDefined();
    expect(op.requestBody).toBeUndefined();
  });

  it('handles complex nullable union (string | number | null)', () => {
    const schema = unwrapSuccessData(
      getResponseSchema(doc, 'complexNullable'),
      doc,
    );
    const valueSchema = schema.properties.value;
    // Should have string, number, and null represented
    const serialized = JSON.stringify(valueSchema);
    expect(serialized).toContain('string');
    expect(serialized).toContain('number');
    expect(serialized).toContain('null');
  });

  it('assigns correct tags based on top-level procedure path', () => {
    const op = doc.paths['/level1.level2.level3.deep']?.['get'] as any;
    expect(op.tags).toEqual(['level1']);

    const simpleOp = doc.paths['/simpleQuery']?.['get'] as any;
    expect(simpleOp.tags).toEqual(['simpleQuery']);
  });

  it('sets default error response reference', () => {
    const op = doc.paths['/simpleQuery']?.['get'] as any;
    expect(op.responses.default).toEqual({
      $ref: '#/components/responses/Error',
    });
  });
});

describe('generateOpenAPIDocument default options', () => {
  let doc: OpenAPIDocument;

  beforeAll(async () => {
    doc = await generateOpenAPIDocument(appRouterPath);
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
    const greetingOp = doc.paths['/greeting']?.['get'] as any;
    const responseSchema =
      greetingOp?.responses?.['200']?.content?.['application/json']?.schema;

    // Should have result.data envelope
    expect(responseSchema.type).toBe('object');
    expect(responseSchema.required).toContain('result');
    expect(responseSchema.properties.result.type).toBe('object');
    expect(responseSchema.properties.result.required).toContain('data');
  });

  it('wraps output without data for void procedures', () => {
    const voidOp = doc.paths['/inferredReturns.voidReturn']?.['post'] as any;
    const responseSchema =
      voidOp?.responses?.['200']?.content?.['application/json']?.schema;

    // Should have result but no data
    expect(responseSchema.type).toBe('object');
    expect(responseSchema.required).toContain('result');
    // result.properties should not have data (or data should be empty)
    const resultProps = responseSchema.properties.result.properties;
    expect(resultProps.data).toBeUndefined();
  });

  it('puts query input with deepObject style for GET', () => {
    const greetingOp = doc.paths['/greeting']?.['get'] as any;
    const param = greetingOp.parameters[0];

    expect(param.name).toBe('input');
    expect(param.in).toBe('query');
    expect(param.required).toBe(true);
    expect(param.style).toBe('deepObject');
    expect(param.content['application/json'].schema).toBeDefined();
  });

  it('puts mutation input as requestBody for POST', () => {
    const createOp = doc.paths['/user.create']?.['post'] as any;

    expect(createOp.requestBody.required).toBe(true);
    expect(
      createOp.requestBody.content['application/json'].schema,
    ).toBeDefined();
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
