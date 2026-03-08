import { existsSync } from 'node:fs';
import http from 'node:http';
import * as path from 'node:path';
import {
  getLanguageService,
  LogLevel,
  ReferenceValidationMode,
} from '@swagger-api/apidom-ls';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import superjson from 'superjson';
import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { OpenAPIDocument } from '../src/generate';
import { generateOpenAPIDocument } from '../src/generate';
import { createTRPCHeyApiClientConfig } from '../src/heyapi';
import { AppRouter } from './routers/appRouter';
import { client as heyapiClient } from './routers/appRouter-heyapi/client.gen';
import { Sdk as HeyapiSdk } from './routers/appRouter-heyapi/sdk.gen';
import { SuperjsonRouter } from './routers/superjsonRouter';
import { client as superjsonClient } from './routers/superjsonRouter-heyapi/client.gen';
import { Sdk as SuperjsonSdk } from './routers/superjsonRouter-heyapi/sdk.gen';

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

const routersDir = path.resolve(__dirname, 'routers');
const appRouterPath = path.resolve(routersDir, 'appRouter.ts');
const errorFormatterRouterPath = path.resolve(
  routersDir,
  'errorFormatterRouter.ts',
);
const superjsonRouterPath = path.resolve(routersDir, 'superjsonRouter.ts');

/** Resolve a schema that may be a $ref into the actual schema object. */
function resolveSchema(schema: any, doc: OpenAPIDocument): any {
  if (!schema?.$ref) return schema;
  // Only handles #/components/schemas/Name refs
  const name = schema.$ref.replace('#/components/schemas/', '');
  return (doc.components as any).schemas?.[name] ?? schema;
}

/**
 * Extract the procedure's output schema from the tRPC success envelope.
 * The envelope is `{ result: { data: T } }`, so we dig into
 * `schema.properties.result.properties.data` and resolve any $ref.
 */
function unwrapSuccessData(schema: any, doc: OpenAPIDocument): any {
  const resolved = resolveSchema(schema, doc);
  const dataSchema = resolved?.properties?.result?.properties?.data;
  return dataSchema ? resolveSchema(dataSchema, doc) : undefined;
}

describe('generateOpenAPIDocument', () => {
  it('throws when the export is not found', () => {
    expect(() =>
      generateOpenAPIDocument(appRouterPath, { exportName: 'NonExistent' }),
    ).toThrow(/NonExistent/);
  });

  it('throws when the file does not exist', () => {
    expect(() => generateOpenAPIDocument('/non/existent/file.ts')).toThrow();
  });

  describe('router json generation', () => {
    let doc: OpenAPIDocument;

    beforeAll(() => {
      doc = generateOpenAPIDocument(appRouterPath, {
        title: 'Test API',
        version: '1.0.0',
      });
    });

    it('returns a valid tRPC OpenAPI 3.0 document', () => {
      expect(doc.openapi).toBe('3.1.1');
      expect(doc.info.title).toBe('Test API');
      expect(doc.info.version).toBe('1.0.0');

      // Keys should be formatted tRPC style as `path.to.procedure`
      for (const key of Object.keys(doc.paths)) {
        expect(key).not.toMatch(/..+\/.+/);
      }
      expect(Object.keys(doc.paths)).toContain('/user.create');
    });

    it('produces a spec with no validation errors when validated', async () => {
      const spec = JSON.stringify(doc, null, 2);
      const problems = await validateOpenAPI(spec);

      expect(JSON.stringify(problems, null, 2)).toEqual('[]');
    });

    it('serialises the error shape from errorFormatter into components', () => {
      // The default router uses `initTRPC.create()` with no custom error formatter,
      // so the error response schema should match the DefaultErrorShape type.
      const envelopeSchema = (doc.components as any).responses.Error.content[
        'application/json'
      ].schema;

      // The envelope wraps the error shape: { error: TRPCErrorShape }
      expect(envelopeSchema.type).toBe('object');
      expect(envelopeSchema.required).toContain('error');

      const rawErrorSchema = envelopeSchema.properties.error;
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
      const responseSchema = unwrapSuccessData(rawResponseSchema, doc);

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
      const inferredSchema = unwrapSuccessData(rawInferredSchema, doc);

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
      const withProfileOutput = unwrapSuccessData(
        (doc.paths['/namedTypes.withProfile']?.['get'] as any)?.responses?.[
          '200'
        ]?.content?.['application/json']?.schema,
        doc,
      );
      expect(withProfileOutput.properties.profile).toEqual({
        $ref: '#/components/schemas/UserProfile',
      });

      // Array items: named type inside array → items is a $ref
      const orderItemsOutput = unwrapSuccessData(
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
      const paOutput = unwrapSuccessData(
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
      const deepOutput = unwrapSuccessData(
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

      // The procedures should reference these schemas (inside the tRPC envelope)
      const treeOp = doc.paths['/recursiveTypes.tree']?.['get'] as any;
      const treeData =
        treeOp?.responses?.['200']?.content?.['application/json']?.schema
          ?.properties?.result?.properties?.data;
      expect(treeData).toEqual({ $ref: '#/components/schemas/TreeNode' });

      // z.lazy() output resolves through the inferred return type
      const categoryOp = doc.paths['/recursiveTypes.category']?.['get'] as any;
      const categoryData =
        categoryOp?.responses?.['200']?.content?.['application/json']?.schema
          ?.properties?.result?.properties?.data;
      expect(categoryData).toEqual({ $ref: '#/components/schemas/Category' });
    });
  });

  describe('hey-api client generation', () => {
    const genDir = path.resolve(routersDir, 'appRouter-heyapi');

    const transformerlessClientConfig = createTRPCHeyApiClientConfig();

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

      heyapiClient.setConfig({
        baseUrl,
        ...transformerlessClientConfig,
      });

      const sdk = new HeyapiSdk({ client: heyapiClient });

      // --- Query with input ---
      const greetingResult = await sdk.greeting({
        query: { input: { name: 'World' } },
        querySerializer: transformerlessClientConfig.querySerializer,
      });
      expect(greetingResult.data).toBeDefined();
      expect(greetingResult.data!.result.data).toEqual({
        message: 'Hello World',
      });

      // --- Query without input ---
      const noInputResult = await sdk.noInput();
      expect(noInputResult.data).toBeDefined();
      expect(noInputResult.data!.result.data).toBe('hello');

      // --- Mutation with input ---
      const userResult = await sdk.user.create({
        body: { name: 'Bob', age: 30 },
      });
      expect(userResult.data).toBeDefined();
      expect(userResult.data!.result.data).toEqual({
        id: 2,
        name: 'Bob',
        age: 30,
      });

      // --- Mutation (echo) ---
      const echoResult = await sdk.echo({
        body: 'test-echo',
      });
      expect(echoResult.data).toBeDefined();
      expect(echoResult.data!.result.data).toBe('test-echo');
    });
  });

  describe('custom errorFormatter', () => {
    let doc: OpenAPIDocument;

    beforeAll(() => {
      doc = generateOpenAPIDocument(errorFormatterRouterPath, {
        exportName: 'ErrorFormatterRouter',
        title: 'Error Formatter API',
        version: '1.0.0',
      });
    });

    it('serialises the custom error shape into the error response', () => {
      const envelopeSchema = (doc.components as any).responses.Error.content[
        'application/json'
      ].schema;

      // The envelope wraps the error shape: { error: TRPCErrorShape }
      expect(envelopeSchema.type).toBe('object');
      expect(envelopeSchema.required).toContain('error');

      const rawErrorSchema = envelopeSchema.properties.error;
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
      const envelopeSchema = (doc.components as any).responses.Error.content[
        'application/json'
      ].schema;
      const rawErrorSchema = envelopeSchema.properties.error;
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

  describe('superjson transformer', () => {
    let doc: OpenAPIDocument;

    const superjsonClientConfig = createTRPCHeyApiClientConfig({
      transformer: superjson,
    });

    beforeAll(() => {
      doc = generateOpenAPIDocument(superjsonRouterPath, {
        exportName: 'SuperjsonRouter',
        title: 'Superjson API',
        version: '1.0.0',
      });
    });

    it('returns raw superjson envelope without a superjson response interceptor', async () => {
      const handler = createHTTPHandler({ router: SuperjsonRouter });
      const server = http.createServer(handler);

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const addr = server.address() as { port: number };
      const baseUrl = `http://localhost:${addr.port}`;
      await using _ = server;

      superjsonClient.setConfig({
        baseUrl,
      });

      const sdk = new SuperjsonSdk({ client: superjsonClient });

      const input = { id: 'evt_1', at: new Date('2025-06-15T10:00:00Z') };

      // inputs need serialising properly
      await expect(async () => {
        await sdk.getEvent({
          query: {
            input,
          },
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: Deeply-nested arrays/objects aren’t supported. Provide your own \`querySerializer()\` to handle these.]`,
      );

      const result = await sdk.getEvent({
        query: {
          input,
        },
        // Add a serialiser so we can get a response
        querySerializer: superjsonClientConfig.querySerializer,
      });

      // Without superjson deserialization on the response, result.data
      // contains the tRPC envelope whose data is the raw superjson shape:
      // { json: { ... }, meta: { values: ... } }
      expect(result.data).toBeDefined();
      const innerData = result.data!.result.data as any;
      expect(innerData).toHaveProperty('json');
      expect(innerData).toHaveProperty('meta');
      // The date in the json part is an ISO string, not a Date object
      expect(typeof innerData.json.at).toBe('string');
    });

    it('returns proper dates with a superjson interceptor', async () => {
      const handler = createHTTPHandler({ router: SuperjsonRouter });
      const server = http.createServer(handler);

      await new Promise<void>((resolve) => server.listen(0, resolve));
      const addr = server.address() as { port: number };
      const baseUrl = `http://localhost:${addr.port}`;
      await using _ = server;

      superjsonClient.setConfig({ baseUrl, ...superjsonClientConfig });

      const sdk = new SuperjsonSdk({ client: superjsonClient });

      // --- Query with superjson on both ends ---
      const getResult = await sdk.getEvent({
        query: {
          input: { id: 'evt_1', at: new Date('2025-06-15T10:00:00Z') },
        },
      });

      expect(getResult.data).toBeDefined();
      expect(getResult.data!.result.data).toEqual({
        id: 'evt_1',
        at: new Date('2025-06-15T10:00:00.000Z'),
      });

      // --- Mutation with superjson on both ends ---
      // Pre-serialize with superjson since JSON.stringify loses Date type info
      const createResult = await sdk.createEvent({
        body: {
          name: 'Conference',
          at: new Date('2025-09-01T09:00:00Z'),
        },
      });

      expect(createResult.data).toBeDefined();
      expect(createResult.data!.result.data).toEqual({
        name: 'Conference',
        at: new Date('2025-09-01T09:00:00.000Z'),
      });
    });
  });
});
