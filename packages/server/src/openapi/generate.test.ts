import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import * as path from 'node:path';
import { AppRouter } from './__testRouter';
import {
  getLanguageService,
  LogLevel,
  ReferenceValidationMode,
} from '@swagger-api/apidom-ls';
import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createHTTPHandler } from '../adapters/standalone';
import type { OpenAPIDocument } from './generate';
import { generateOpenAPIDocument } from './generate';

const languageService = getLanguageService({
  logLevel: LogLevel.ERROR,
  validationContext: {
    referenceValidationContinueOnError: true,
    referenceValidationMode: ReferenceValidationMode.APIDOM_INDIRECT_EXTERNAL,
  },
});

async function validateOpenAPI(spec: string) {
  const document = TextDocument.create('file:///spec', 'json', 1, spec);
  const diagnostics = await languageService.doValidation(document);

  return diagnostics.map((d) => ({
    line: d.range.start.line + 1,
    character: d.range.start.character + 1,
    message: d.message,
    severity: d.severity,
    code: d.code,
    source: d.source,
  }));
}

const testRouterPath = path.resolve(__dirname, '__testRouter.ts');

/** Resolve a schema that may be a $ref into the actual schema object. */
function resolveSchema(schema: any, doc: OpenAPIDocument): any {
  if (!schema?.$ref) return schema;
  // Only handles #/components/schemas/Name refs
  const name = schema.$ref.replace('#/components/schemas/', '');
  return (doc.components as any).schemas?.[name] ?? schema;
}

describe('generateOpenAPIDocument', () => {
  it('throws when the export is not found', () => {
    expect(() =>
      generateOpenAPIDocument(testRouterPath, { exportName: 'NonExistent' }),
    ).toThrow(/NonExistent/);
  });

  it('throws when the file does not exist', () => {
    expect(() => generateOpenAPIDocument('/non/existent/file.ts')).toThrow();
  });

  describe('router json generation', () => {
    let doc: OpenAPIDocument;

    beforeAll(() => {
      doc = generateOpenAPIDocument(testRouterPath, {
        title: 'Test API',
        version: '1.0.0',
      });
    });

    it('returns a valid tRPC OpenAPI 3.0 document', () => {
      expect(doc.openapi).toBe('3.0.3');
      expect(doc.info.title).toBe('Test API');
      expect(doc.info.version).toBe('1.0.0');

      // Keys should be formatted tRPC style as `path.to.procedure`
      for (const key of Object.keys(doc.paths)) {
        expect(key).not.toMatch(/..+\/.+/);
      }
      expect(Object.keys(doc.paths)).toContain('/user.create');
    });

    it('matches snapshot', () => {
      const doc = generateOpenAPIDocument(testRouterPath);

      // Note to LLMs/Agents, you can read packages/server/src/openapi/__testRouter.ts.json
      // to understand the output after a snapshot update
      expect(JSON.stringify(doc, null, 2)).toMatchFileSnapshot(
        testRouterPath + '.json',
      );
    });

    it('produces a spec with no validation errors when validated', async () => {
      const spec = JSON.stringify(doc, null, 2);
      const problems = await validateOpenAPI(spec);

      expect(problems).toEqual([]);
    });

    it('serialises the error shape from errorFormatter into components', () => {
      // The default router uses `initTRPC.create()` with no custom error formatter,
      // so the error response schema should match the DefaultErrorShape type.
      const rawErrorSchema = (doc.components as any).responses.error.content[
        'application/json'
      ].schema;
      const errorSchema = resolveSchema(rawErrorSchema, doc);

      // DefaultErrorShape has: message (string), code (number), data (object with code, httpStatus, path?, stack?)
      expect(errorSchema.type).toBe('object');
      expect(errorSchema.properties).toHaveProperty('message');
      expect(errorSchema.properties).toHaveProperty('code');
      expect(errorSchema.properties).toHaveProperty('data');
      expect(errorSchema.required).toContain('message');
      expect(errorSchema.required).toContain('code');
      expect(errorSchema.required).toContain('data');
    });

    it('strips Zod brand metadata from branded types', () => {
      const spec = JSON.stringify(doc);

      // Brand internals must never appear in the OpenAPI output
      expect(spec).not.toContain('__@$brand@');

      // The branded field should be emitted as its base type (string)
      const brandedOp = doc.paths['/complexTypes.branded']?.['get'] as any;
      const rawResponseSchema =
        brandedOp?.responses?.['200']?.content?.['application/json']?.schema;
      const responseSchema = resolveSchema(rawResponseSchema, doc);

      expect(responseSchema).toEqual({
        type: 'object',
        properties: { userId: { type: 'string' } },
        required: ['userId'],
      });

      // Inferred branded returns (string & {__brand}, number & {__brand}, boolean & {__brand})
      const inferredOp = doc.paths['/inferredReturns.brandedReturns']?.[
        'get'
      ] as any;
      const rawInferredSchema =
        inferredOp?.responses?.['200']?.content?.['application/json']?.schema;
      const inferredSchema = resolveSchema(rawInferredSchema, doc);

      // No brand object should leak — all fields should resolve to primitives
      expect(inferredSchema?.properties?.userId).toEqual({ type: 'string' });
      expect(inferredSchema?.properties?.score).toEqual({ type: 'number' });
      // Boolean branded type should not contain any object/allOf from the brand
      const activeSchema = inferredSchema?.properties?.active;
      expect(JSON.stringify(activeSchema)).not.toContain('__brand');
    });

    it('extracts named TS types at any depth into components/schemas', () => {
      const schemas = (doc.components as any).schemas;

      // Named interfaces should appear in schemas by their TS name
      expect(schemas).toHaveProperty('UserProfile');
      expect(schemas).toHaveProperty('Address');
      expect(schemas).toHaveProperty('OrderItem');

      expect(schemas.UserProfile).toEqual({
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['id', 'name', 'email'],
      });

      // Depth 1: named type as a direct property → property is a $ref
      const withProfileOutput = resolveSchema(
        (doc.paths['/namedTypes.withProfile']?.['get'] as any)?.responses?.[
          '200'
        ]?.content?.['application/json']?.schema,
        doc,
      );
      expect(withProfileOutput.properties.profile).toEqual({
        $ref: '#/components/schemas/UserProfile',
      });

      // Array items: named type inside array → items is a $ref
      const orderItemsOutput = resolveSchema(
        (doc.paths['/namedTypes.orderItems']?.['get'] as any)?.responses?.[
          '200'
        ]?.content?.['application/json']?.schema,
        doc,
      );
      expect(orderItemsOutput.properties.items).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/OrderItem' },
      });

      // Dedup: same named type reused across procedures → same $ref
      const paOutput = resolveSchema(
        (doc.paths['/namedTypes.profileAndAddress']?.['get'] as any)
          ?.responses?.['200']?.content?.['application/json']?.schema,
        doc,
      );
      expect(paOutput.properties.profile).toEqual({
        $ref: '#/components/schemas/UserProfile',
      });
      expect(paOutput.properties.address).toEqual({
        $ref: '#/components/schemas/Address',
      });

      // Depth 3: named type deeply nested → still a $ref
      const deepOutput = resolveSchema(
        (doc.paths['/namedTypes.deepNested']?.['get'] as any)?.responses?.[
          '200'
        ]?.content?.['application/json']?.schema,
        doc,
      );
      expect(
        deepOutput.properties.data.properties.nested.properties.profile,
      ).toEqual({ $ref: '#/components/schemas/UserProfile' });
    });

    it('handles recursive types via self-referencing $ref', () => {
      const schemas = (doc.components as any).schemas;

      // TreeNode: children is an array of TreeNode (self-ref)
      expect(schemas).toHaveProperty('TreeNode');
      expect(schemas.TreeNode.properties.children).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/TreeNode' },
      });

      // LinkedListNode: next is LinkedListNode | null (nullable self-ref)
      expect(schemas).toHaveProperty('LinkedListNode');
      expect(schemas.LinkedListNode.properties.next).toEqual({
        allOf: [{ $ref: '#/components/schemas/LinkedListNode' }],
        nullable: true,
      });

      // Category: Zod z.lazy() recursive input
      expect(schemas).toHaveProperty('Category');
      expect(schemas.Category.properties.subcategories).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/Category' },
      });

      // The procedures should reference these schemas
      const treeOp = doc.paths['/recursiveTypes.tree']?.['get'] as any;
      expect(
        treeOp?.responses?.['200']?.content?.['application/json']?.schema,
      ).toEqual({ $ref: '#/components/schemas/TreeNode' });

      // z.lazy() output resolves through the inferred return type
      const categoryOp = doc.paths['/recursiveTypes.category']?.['get'] as any;
      expect(
        categoryOp?.responses?.['200']?.content?.['application/json']?.schema,
      ).toEqual({ $ref: '#/components/schemas/Category' });
    });
  });

  describe('hey-api client generation', () => {
    const genDir = path.resolve(__dirname, '__gen__', 'heyapi');
    const specPath = path.resolve(__dirname, '__gen__', 'spec.json');

    beforeAll(() => {
      rmSync(path.resolve(__dirname, '__gen__'), {
        recursive: true,
        force: true,
      });

      const doc = generateOpenAPIDocument(testRouterPath);
      mkdirSync(path.dirname(specPath), { recursive: true });
      writeFileSync(specPath, JSON.stringify(doc, null, 2));
      execSync(
        `npx @hey-api/openapi-ts -i ${specPath} -o ${genDir} -c @hey-api/client-fetch --silent`,
        { stdio: 'pipe' },
      );
    });

    it('generates SDK files from the spec', () => {
      expect(existsSync(path.join(genDir, 'sdk.gen.ts'))).toBe(true);
      expect(existsSync(path.join(genDir, 'types.gen.ts'))).toBe(true);
    });

    it('calls query and mutation endpoints via the generated client', async () => {
      const handler = createHTTPHandler({ router: AppRouter });
      const server = http.createServer(handler);

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const addr = server.address() as { port: number };
      const baseUrl = `http://localhost:${addr.port}`;
      await using _ = server;

      // Import the generated SDK and client config
      const sdkPath = path.join(__dirname, '__gen__/heyapi/sdk.gen');
      const clientPath = path.join(__dirname, '__gen__/heyapi/client.gen');
      const sdk = await import(/* @vite-ignore */ sdkPath);
      const clientMod = await import(/* @vite-ignore */ clientPath);

      // Configure the client for our test server with tRPC-compatible
      // query serialization and response envelope unwrapping.
      const client = clientMod.client;
      client.setConfig({ baseUrl });

      // tRPC wraps responses in { result: { data: ... } }, so unwrap
      // by rewriting the response body before the client parses it.
      client.interceptors.response.use(async (response: Response) => {
        if (!response.ok) return response;
        const body = await response.json();
        const unwrapped = body?.result?.data ?? body;
        return new Response(JSON.stringify(unwrapped), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      });

      // --- Query with input ---
      const greetingResult = await sdk.greeting({
        query: { input: { name: 'World' } },
        // tRPC expects ?input=<JSON>, so provide a custom serializer
        querySerializer: () =>
          `input=${encodeURIComponent(JSON.stringify({ name: 'World' }))}`,
      });
      expect(greetingResult.data).toEqual({ message: 'Hello World' });

      // --- Query without input ---
      const noInputResult = await sdk.noInput();
      expect(noInputResult.data).toBe('hello');

      // --- Mutation with input ---
      const userResult = await sdk.userCreate({
        body: { name: 'Bob', age: 30 },
      });
      expect(userResult.data).toEqual({ id: 2, name: 'Bob', age: 30 });

      // --- Mutation (echo) ---
      const echoResult = await sdk.echo({
        body: 'test-echo',
      });
      expect(echoResult.data).toBe('test-echo');
    });
  });

  describe('custom errorFormatter', () => {
    let doc: OpenAPIDocument;

    beforeAll(() => {
      doc = generateOpenAPIDocument(testRouterPath, {
        exportName: 'ErrorFormatterRouter',
        title: 'Error Formatter API',
        version: '1.0.0',
      });
    });

    it('serialises the custom error shape into the error response', () => {
      const rawErrorSchema = (doc.components as any).responses.error.content[
        'application/json'
      ].schema;
      const errorSchema = resolveSchema(rawErrorSchema, doc);

      // The custom formatter extends DefaultErrorShape and adds a zodError
      // field inside `data`.
      expect(errorSchema.type).toBe('object');
      expect(errorSchema.properties).toHaveProperty('message');
      expect(errorSchema.properties).toHaveProperty('code');
      expect(errorSchema.properties).toHaveProperty('data');

      // The `data` property should contain the extra `zodError` field
      const dataSchema = resolveSchema(errorSchema.properties.data, doc);
      expect(dataSchema.properties).toHaveProperty('zodError');
    });

    it('still includes standard error fields', () => {
      const rawErrorSchema = (doc.components as any).responses.error.content[
        'application/json'
      ].schema;
      const errorSchema = resolveSchema(rawErrorSchema, doc);

      // Standard fields from DefaultErrorShape
      expect(errorSchema.properties.message).toEqual({ type: 'string' });
      // `code` is TRPC_ERROR_CODE_NUMBER — a union of number literals collapsed to a single enum
      expect(errorSchema.properties.code.type).toBe('number');
      expect(errorSchema.properties.code.enum).toBeInstanceOf(Array);
      expect(errorSchema.properties.code.enum.length).toBeGreaterThan(0);

      // Standard data fields (code, httpStatus)
      const dataSchema = resolveSchema(errorSchema.properties.data, doc);
      expect(dataSchema.properties).toHaveProperty('code');
      expect(dataSchema.properties).toHaveProperty('httpStatus');
    });

    it('produces a valid OpenAPI spec', async () => {
      const spec = JSON.stringify(doc, null, 2);
      const problems = await validateOpenAPI(spec);
      expect(problems).toEqual([]);
    });
  });
});
