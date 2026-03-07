import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateOpenAPIDocument } from './generate';

const testRouterPath = path.resolve(
  __dirname,
  '__testRouter.ts',
);

describe('generateOpenAPIDocument', () => {
  it('returns a valid OpenAPI 3.0 document', () => {
    const doc = generateOpenAPIDocument(testRouterPath, {
      title: 'Test API',
      version: '1.0.0',
    });
    expect(doc.openapi).toBe('3.0.3');
    expect(doc.info.title).toBe('Test API');
    expect(doc.info.version).toBe('1.0.0');
  });

  it('includes all query and mutation procedures', () => {
    const doc = generateOpenAPIDocument(testRouterPath);
    const paths = Object.keys(doc.paths);
    expect(paths).toContain('/greeting');
    expect(paths).toContain('/noInput');
    expect(paths).toContain('/echo');
    expect(paths).toContain('/user/list');
    expect(paths).toContain('/user/create');
  });

  it('maps query procedures to GET', () => {
    const doc = generateOpenAPIDocument(testRouterPath);
    expect(doc.paths['/greeting']).toHaveProperty('get');
    expect(doc.paths['/greeting']).not.toHaveProperty('post');
  });

  it('maps mutation procedures to POST', () => {
    const doc = generateOpenAPIDocument(testRouterPath);
    expect(doc.paths['/echo']).toHaveProperty('post');
    expect(doc.paths['/echo']).not.toHaveProperty('get');
  });

  it('includes input schema for queries with input', () => {
    const doc = generateOpenAPIDocument(testRouterPath);
    const op = doc.paths['/greeting']!['get'] as {
      parameters: Array<{ name: string; schema?: unknown; content?: unknown }>;
    };
    expect(op.parameters).toBeDefined();
    const inputParam = op.parameters.find((p) => p.name === 'input');
    expect(inputParam).toBeDefined();
    // The input should contain the schema for { name: string }
    expect(inputParam!.content).toBeDefined();
  });

  it('omits parameters for queries with no input', () => {
    const doc = generateOpenAPIDocument(testRouterPath);
    const op = doc.paths['/noInput']!['get'] as {
      parameters?: unknown[];
    };
    expect(op.parameters).toBeUndefined();
  });

  it('includes requestBody for mutation procedures', () => {
    const doc = generateOpenAPIDocument(testRouterPath);
    const op = doc.paths['/user/create']!['post'] as {
      requestBody: { content: Record<string, { schema: unknown }> };
    };
    expect(op.requestBody).toBeDefined();
    expect(op.requestBody.content['application/json']!.schema).toMatchObject({
      type: 'object',
    });
  });

  it('includes output schema in responses', () => {
    const doc = generateOpenAPIDocument(testRouterPath);
    const op = doc.paths['/greeting']!['get'] as {
      responses: { '200': { content: Record<string, { schema: unknown }> } };
    };
    const schema = op.responses['200'].content['application/json']!.schema;
    expect(schema).toMatchObject({
      type: 'object',
      properties: { message: { type: 'string' } },
    });
  });

  it('marks optional fields as not required', () => {
    const doc = generateOpenAPIDocument(testRouterPath);
    const op = doc.paths['/user/create']!['post'] as {
      requestBody: {
        content: Record<string, { schema: { required: string[] } }>;
      };
    };
    const required =
      op.requestBody.content['application/json']!.schema.required;
    expect(required).toContain('name');
    expect(required).not.toContain('age');
  });

  it('throws when the export is not found', () => {
    expect(() =>
      generateOpenAPIDocument(testRouterPath, { exportName: 'NonExistent' }),
    ).toThrow(/NonExistent/);
  });

  it('throws when the file does not exist', () => {
    expect(() =>
      generateOpenAPIDocument('/non/existent/file.ts'),
    ).toThrow();
  });
});
