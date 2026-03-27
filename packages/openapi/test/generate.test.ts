import { existsSync } from 'node:fs';
import http from 'node:http';
import * as path from 'node:path';
import { getLanguageService, LogLevel } from '@swagger-api/apidom-ls';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import superjson from 'superjson';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { generateOpenAPIDocument } from '../src/generate';
import {
  configureTRPCHeyApiClient,
  createTRPCHeyApiClientConfig,
} from '../src/heyapi';
import type { Document } from '../src/types';
import { AppRouter } from './routers/appRouter';
import { client as heyapiClient } from './routers/appRouter-heyapi/client.gen';
import { Sdk as HeyapiSdk } from './routers/appRouter-heyapi/sdk.gen';
import type {
  ComplexTypesCreateContentResponses,
  ComplexTypesDiscriminatedUnionResponses,
  ComplexTypesPassthroughData,
  ComplexTypesRecordResponses,
  GreetingData,
  GreetingResponses,
  UserProfile as HeyApiUserProfile,
} from './routers/appRouter-heyapi/types.gen';
import { SuperjsonRouter } from './routers/superjsonRouter';
import { client as superjsonClient } from './routers/superjsonRouter-heyapi/client.gen';
import { Sdk as SuperjsonSdk } from './routers/superjsonRouter-heyapi/sdk.gen';
import {
  getSchemas,
  isArraySchema,
  isRef,
  requireArrayItemsSchema,
  requireEnvelopeDataSchema,
  requireInputSchema,
  requireOperation,
  requireOutputData,
  requireProperty,
  requireResponseComponentSchema,
  requireSchema,
  requireSchemaObject,
} from './types';

const languageService = getLanguageService({
  logLevel: LogLevel.ERROR,
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

function getErrorEnvelopeSchema(doc: Document) {
  return requireSchemaObject(
    requireResponseComponentSchema(doc, 'Error'),
    doc,
    'Error response',
  );
}

describe('generateOpenAPIDocument', () => {
  it('throws when the export is not found', async () => {
    await expect(
      generateOpenAPIDocument(appRouterPath, { exportName: 'NonExistent' }),
    ).rejects.toThrow(/NonExistent/);
  });

  it('throws when the file does not exist', async () => {
    await expect(
      generateOpenAPIDocument('/non/existent/file.ts'),
    ).rejects.toThrow();
  });

  describe('router json generation', () => {
    let doc: Document;

    beforeAll(async () => {
      doc = await generateOpenAPIDocument(appRouterPath, {
        title: 'Test API',
        version: '1.0.0',
      });
    });

    it('returns a valid tRPC OpenAPI 3.1 document', () => {
      const paths = doc.paths ?? {};

      expect(doc.openapi).toBe('3.1.1');
      expect(doc.jsonSchemaDialect).toBe(
        'https://spec.openapis.org/oas/3.1/dialect/base',
      );
      expect(doc.info.title).toBe('Test API');
      expect(doc.info.version).toBe('1.0.0');

      // Keys should be formatted tRPC style as `path.to.procedure`
      for (const key of Object.keys(paths)) {
        expect(key).not.toMatch(/..+\/.+/);
      }
      expect(Object.keys(paths)).toContain('/user.create');
    });

    it('produces a spec with no validation errors when validated', async () => {
      const spec = JSON.stringify(doc, null, 2);
      const problems = await validateOpenAPI(spec);

      expect(JSON.stringify(problems, null, 2)).toEqual('[]');
    });

    it('serialises the error shape from errorFormatter into components', () => {
      // The default router uses `initTRPC.create()` with no custom error formatter,
      // so the error response schema should match the DefaultErrorShape type.
      const envelopeSchema = getErrorEnvelopeSchema(doc);

      // The envelope wraps the error shape: { error: TRPCErrorShape }
      expect(envelopeSchema.type).toBe('object');
      expect(envelopeSchema.required).toContain('error');

      const errorSchema = requireSchemaObject(
        requireProperty(envelopeSchema, 'error'),
        doc,
        'Error response.error',
      );

      // DefaultErrorShape has: message (string), code (number), data (object with code, httpStatus, path?, stack?)
      expect(errorSchema.type).toBe('object');
      expect(errorSchema.properties).toHaveProperty('message');
      expect(errorSchema.properties).toHaveProperty('code');
      expect(errorSchema.properties).toHaveProperty('data');
      expect(errorSchema.required).toContain('message');
      expect(errorSchema.required).toContain('code');
      expect(errorSchema.required).toContain('data');
    });

    it('handles bigint inferred return types as integer schema', () => {
      const responseSchema = requireOutputData({
        doc,
        procPath: 'inferredReturns.bigintReturn',
      });

      expect(requireProperty(responseSchema, 'amount')).toEqual({
        type: 'integer',
        format: 'bigint',
      });
    });

    it('strips Zod brand metadata from branded types', () => {
      const spec = JSON.stringify(doc);

      // Brand internals must never appear in the OpenAPI output
      expect(spec).not.toContain('__@$brand@');

      // The branded field should be emitted as its base type (string)
      const responseSchema = requireOutputData({
        doc,
        procPath: 'complexTypes.branded',
      });

      expect(responseSchema).toEqual({
        type: 'object',
        properties: { userId: { type: 'string' } },
        required: ['userId'],
        additionalProperties: false,
      });

      // Inferred branded returns (string & {__brand}, number & {__brand}, boolean & {__brand})
      const inferredSchema = requireOutputData({
        doc,
        procPath: 'inferredReturns.brandedReturns',
      });

      // No brand object should leak — all fields should resolve to primitives
      expect(requireProperty(inferredSchema, 'userId')).toEqual({
        type: 'string',
      });
      expect(requireProperty(inferredSchema, 'score')).toEqual({
        type: 'number',
      });
      // Boolean branded type should not contain any object/allOf from the brand
      const activeSchema = requireProperty(inferredSchema, 'active');
      expect(JSON.stringify(activeSchema)).not.toContain('__brand');
    });

    it('extracts named TS types at any depth into components/schemas', () => {
      const schemas = getSchemas(doc);

      // Named interfaces should appear in schemas by their TS name
      expect(schemas).toHaveProperty('UserProfile');
      expect(schemas).toHaveProperty('Address');
      expect(schemas).toHaveProperty('OrderItem');

      expect(requireSchema(doc, 'UserProfile')).toEqual({
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['id', 'name', 'email'],
        additionalProperties: false,
      });

      // Depth 1: named type as a direct property → property is a $ref
      const withProfileOutput = requireOutputData({
        doc,
        procPath: 'namedTypes.withProfile',
      });
      expect(requireProperty(withProfileOutput, 'profile')).toEqual({
        $ref: '#/components/schemas/UserProfile',
      });

      // Array items: named type inside array → items is a $ref
      const orderItemsOutput = requireOutputData({
        doc,
        procPath: 'namedTypes.orderItems',
      });
      expect(requireProperty(orderItemsOutput, 'items')).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/OrderItem' },
      });

      // Dedup: same named type reused across procedures → same $ref
      const paOutput = requireOutputData({
        doc,
        procPath: 'namedTypes.profileAndAddress',
      });
      expect(requireProperty(paOutput, 'profile')).toEqual({
        $ref: '#/components/schemas/UserProfile',
      });
      expect(requireProperty(paOutput, 'address')).toEqual({
        $ref: '#/components/schemas/Address',
      });

      // Depth 3: named type deeply nested → still a $ref
      const deepOutput = requireOutputData({
        doc,
        procPath: 'namedTypes.deepNested',
      });
      const dataSchema = requireSchemaObject(
        requireProperty(deepOutput, 'data'),
        doc,
        'namedTypes.deepNested.data',
      );
      const nestedSchema = requireSchemaObject(
        requireProperty(dataSchema, 'nested'),
        doc,
        'namedTypes.deepNested.data.nested',
      );
      expect(requireProperty(nestedSchema, 'profile')).toEqual({
        $ref: '#/components/schemas/UserProfile',
      });
    });

    it('handles recursive types via self-referencing $ref', () => {
      const schemas = getSchemas(doc);

      // TreeNode: children is an array of TreeNode (self-ref)
      expect(schemas).toHaveProperty('TreeNode');
      expect(
        requireProperty(requireSchema(doc, 'TreeNode'), 'children'),
      ).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/TreeNode' },
      });

      // LinkedListNode: next is LinkedListNode | null (nullable self-ref)
      expect(schemas).toHaveProperty('LinkedListNode');
      expect(
        requireProperty(requireSchema(doc, 'LinkedListNode'), 'next'),
      ).toEqual({
        oneOf: [
          { $ref: '#/components/schemas/LinkedListNode' },
          { type: 'null' },
        ],
      });

      // Category: Zod z.lazy() recursive input
      expect(schemas).toHaveProperty('Category');
      expect(
        requireProperty(requireSchema(doc, 'Category'), 'subcategories'),
      ).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/Category' },
      });

      // The procedures should reference these schemas (inside the tRPC envelope)
      expect(
        requireEnvelopeDataSchema({ doc, procPath: 'recursiveTypes.tree' }),
      ).toEqual({
        $ref: '#/components/schemas/TreeNode',
      });

      // z.lazy() output resolves through the inferred return type
      expect(
        requireEnvelopeDataSchema({
          doc,
          procPath: 'recursiveTypes.category',
        }),
      ).toEqual({
        $ref: '#/components/schemas/Category',
      });
    });

    it('adds discriminator to discriminated unions', () => {
      // Zod discriminatedUnion input (discriminant: "type")
      const inputSchema = requireSchemaObject(
        requireInputSchema(doc, 'complexTypes.discriminatedUnion', 'post'),
        doc,
        'complexTypes.discriminatedUnion input',
      );
      expect(inputSchema).toHaveProperty('oneOf');
      expect(inputSchema.discriminator).toEqual({ propertyName: 'type' });

      // Zod discriminatedUnion output (discriminant: "status")
      const outputSchema = requireOutputData({
        doc,
        procPath: 'complexTypes.createContent',
        method: 'post',
      });
      expect(outputSchema).toHaveProperty('oneOf');
      expect(outputSchema.discriminator).toEqual({
        propertyName: 'status',
      });

      // Inferred return discriminated union (discriminant: "type")
      const inferredSchema = requireOutputData({
        doc,
        procPath: 'inferredReturns.discriminatedResult',
        method: 'post',
      });
      expect(inferredSchema).toHaveProperty('oneOf');
      expect(inferredSchema.discriminator).toEqual({
        propertyName: 'type',
      });

      // Regular (non-discriminated) union should NOT have a discriminator
      const unionInputSchema = requireSchemaObject(
        requireInputSchema(doc, 'complexTypes.union'),
        doc,
        'complexTypes.union input',
      );
      const valueSchema = requireProperty(unionInputSchema, 'value');
      expect(valueSchema).not.toHaveProperty('discriminator');
    });

    it('emits additionalProperties: false for closed objects', () => {
      // Named schema: UserProfile is a closed object
      expect(requireSchema(doc, 'UserProfile').additionalProperties).toBe(
        false,
      );
      expect(requireSchema(doc, 'Address').additionalProperties).toBe(false);
      expect(requireSchema(doc, 'OrderItem').additionalProperties).toBe(false);

      // Inline object in Zod input
      const greetingInput = requireSchemaObject(
        requireInputSchema(doc, 'greeting'),
        doc,
        'greeting input',
      );
      expect(greetingInput.additionalProperties).toBe(false);

      // Record types should NOT have additionalProperties: false
      const recordInput = requireSchemaObject(
        requireInputSchema(doc, 'complexTypes.record'),
        doc,
        'complexTypes.record input',
      );
      // metadata is Record<string, string> → additionalProperties: { type: "string" }
      const metadataSchema = requireSchemaObject(
        requireProperty(recordInput, 'metadata'),
        doc,
        'complexTypes.record.metadata',
      );
      expect(metadataSchema.additionalProperties).toEqual({
        type: 'string',
      });
      // scores is Record<string, number> → additionalProperties: { type: "number" }
      const scoresSchema = requireSchemaObject(
        requireProperty(recordInput, 'scores'),
        doc,
        'complexTypes.record.scores',
      );
      expect(scoresSchema.additionalProperties).toEqual({
        type: 'number',
      });

      // Passthrough objects should NOT have additionalProperties: false
      const passthroughInput = requireSchemaObject(
        requireInputSchema(doc, 'complexTypes.passthrough'),
        doc,
        'complexTypes.passthrough input',
      );
      expect(passthroughInput.additionalProperties).not.toBe(false);
    });
  });

  describe('hey-api client generation', () => {
    const genDir = path.resolve(routersDir, 'appRouter-heyapi');

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

      configureTRPCHeyApiClient(heyapiClient, { baseUrl });

      const sdk = new HeyapiSdk({ client: heyapiClient });

      // --- Query with input ---
      const greetingResult = await sdk.greeting({
        query: { input: { name: 'World' } },
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

    it('generates discriminated union types with literal discriminants', () => {
      // The discriminatedUnion input has discriminant "type" with literals "text", "image", "video"
      type DiscUnionData =
        ComplexTypesDiscriminatedUnionResponses[200]['result']['data'];

      // Each variant should be assignable when the discriminant matches
      expectTypeOf<{
        type: 'text';
        content: string;
      }>().toExtend<DiscUnionData>();
      expectTypeOf<{
        type: 'image';
        url: string;
        width: number;
        height: number;
      }>().toExtend<DiscUnionData>();
      expectTypeOf<{
        type: 'video';
        url: string;
        duration: number;
      }>().toExtend<DiscUnionData>();

      // A non-matching discriminant should NOT match any variant
      expectTypeOf<{ type: 'audio' }>().not.toExtend<DiscUnionData>();

      // The createContent output has discriminant "status" with "success" | "error"
      type CreateContentData =
        ComplexTypesCreateContentResponses[200]['result']['data'];

      expectTypeOf<{
        status: 'success';
        id: number;
        createdAt: string;
      }>().toExtend<CreateContentData>();
      expectTypeOf<{
        status: 'error';
        message: string;
        code: number;
      }>().toExtend<CreateContentData>();
      expectTypeOf<{ status: 'pending' }>().not.toExtend<CreateContentData>();
    });

    it('generates closed object types for non-Record objects', () => {
      // UserProfile should be a closed type with exactly these fields
      expectTypeOf<HeyApiUserProfile>().toEqualTypeOf<{
        id: number;
        name: string;
        email: string;
      }>();

      // Greeting input is a closed object — extra properties should be rejected
      type GreetingInput = GreetingData['query']['input'];
      expectTypeOf<GreetingInput>().toEqualTypeOf<{ name: string }>();

      // Greeting response data is also closed
      type GreetingOutput = GreetingResponses[200]['result']['data'];
      expectTypeOf<GreetingOutput>().toEqualTypeOf<{ message: string }>();

      // Record types SHOULD allow arbitrary string keys
      type RecordOutput = ComplexTypesRecordResponses[200]['result']['data'];
      expectTypeOf<RecordOutput>().toHaveProperty('metadata');
      // The metadata field should accept any string key
      expectTypeOf<{ foo: 'bar' }>().toExtend<RecordOutput['metadata']>();

      // Passthrough objects SHOULD allow extra string keys
      type PassthroughInput = ComplexTypesPassthroughData['query']['input'];
      expectTypeOf<PassthroughInput>().toHaveProperty('known');
      // Extra properties are allowed via [key: string]: unknown
      expectTypeOf<{
        known: string;
        extra: number;
      }>().toExtend<PassthroughInput>();
    });
  });

  describe('custom errorFormatter', () => {
    let doc: Document;

    beforeAll(async () => {
      doc = await generateOpenAPIDocument(errorFormatterRouterPath, {
        exportName: 'ErrorFormatterRouter',
        title: 'Error Formatter API',
        version: '1.0.0',
      });
    });

    it('serialises the custom error shape into the error response', () => {
      const envelopeSchema = getErrorEnvelopeSchema(doc);

      // The envelope wraps the error shape: { error: TRPCErrorShape }
      expect(envelopeSchema.type).toBe('object');
      expect(envelopeSchema.required).toContain('error');

      const errorSchema = requireSchemaObject(
        requireProperty(envelopeSchema, 'error'),
        doc,
        'Error response.error',
      );

      // The custom formatter extends DefaultErrorShape and adds a zodError
      // field inside `data`.
      expect(errorSchema.type).toBe('object');
      expect(errorSchema.properties).toHaveProperty('message');
      expect(errorSchema.properties).toHaveProperty('code');
      expect(errorSchema.properties).toHaveProperty('data');

      // The `data` property should contain the extra `zodError` field
      const dataSchema = requireSchemaObject(
        requireProperty(errorSchema, 'data'),
        doc,
        'Error response.error.data',
      );
      expect(dataSchema.properties).toHaveProperty('zodError');
    });

    it('still includes standard error fields', () => {
      const envelopeSchema = getErrorEnvelopeSchema(doc);
      const errorSchema = requireSchemaObject(
        requireProperty(envelopeSchema, 'error'),
        doc,
        'Error response.error',
      );

      // Standard fields from DefaultErrorShape
      expect(requireProperty(errorSchema, 'message')).toEqual({
        type: 'string',
      });
      // `code` is TRPC_ERROR_CODE_NUMBER — a union of number literals collapsed to a single enum
      const codeSchema = requireSchemaObject(
        requireProperty(errorSchema, 'code'),
        doc,
        'Error response.error.code',
      );
      expect(codeSchema.type).toBe('number');
      expect(codeSchema.enum).toBeInstanceOf(Array);
      expect(codeSchema.enum?.length).toBeGreaterThan(0);

      // Standard data fields (code, httpStatus)
      const dataSchema = requireSchemaObject(
        requireProperty(errorSchema, 'data'),
        doc,
        'Error response.error.data',
      );
      expect(dataSchema.properties).toHaveProperty('code');
      expect(dataSchema.properties).toHaveProperty('httpStatus');
    });

    it('produces a valid OpenAPI spec', async () => {
      const spec = JSON.stringify(doc, null, 2);
      const problems = await validateOpenAPI(spec);
      expect(problems).toEqual([]);
    });
  });

  describe('procedure descriptions from JSDoc', () => {
    const descriptionsRouterPath = path.resolve(
      routersDir,
      'descriptionsRouter.ts',
    );
    let doc: Document;

    beforeAll(async () => {
      doc = await generateOpenAPIDocument(descriptionsRouterPath, {
        exportName: 'descriptionsRouter',
        title: 'Descriptions API',
        version: '1.0.0',
      });
    });

    it('extracts JSDoc from procedure properties into operation description', () => {
      const helloOp = requireOperation(doc, 'hello');
      expect(helloOp.description).toBe('Hello zod Procedure details');
    });

    it('extracts JSDoc from nested subrouter procedure properties', () => {
      const nestedOp = requireOperation(doc, 'subrouter.hello');
      expect(nestedOp.description).toBe('Hello zod Procedure details');
    });

    it('produces a valid OpenAPI spec', async () => {
      const spec = JSON.stringify(doc, null, 2);
      const problems = await validateOpenAPI(spec);
      expect(problems).toEqual([]);
    });
  });

  describe('runtime Zod schema extraction', () => {
    const descriptionsRouterPath = path.resolve(
      routersDir,
      'descriptionsRouter.ts',
    );
    let doc: Document;

    beforeAll(async () => {
      // The router file is automatically imported at runtime, so Zod
      // .describe() metadata flows through without an explicit `router` arg.
      doc = await generateOpenAPIDocument(descriptionsRouterPath, {
        exportName: 'descriptionsRouter',
        title: 'Descriptions API',
        version: '1.0.0',
      });
    });

    it('overlays Zod .describe() strings onto input schemas', () => {
      const inputSchema = requireSchemaObject(
        requireInputSchema(doc, 'hello'),
        doc,
        'hello input',
      );

      // The Zod schema preserves .describe() strings
      expect(inputSchema.description).toBe('Input to the procedure');
      const nameSchema = requireSchemaObject(
        requireProperty(inputSchema, 'name'),
        doc,
        'hello input.name',
      );
      expect(nameSchema.description).toBe('Name of the user');
    });

    it('overlays Zod .describe() strings on nested subrouter procedures', () => {
      const inputSchema = requireSchemaObject(
        requireInputSchema(doc, 'subrouter.hello'),
        doc,
        'subrouter.hello input',
      );

      expect(inputSchema.description).toBe('Input to the procedure');
      const nameSchema = requireSchemaObject(
        requireProperty(inputSchema, 'name'),
        doc,
        'subrouter.hello input.name',
      );
      expect(nameSchema.description).toBe('Name of the user');
    });

    it('overlays Zod .describe() strings through array item $refs', () => {
      const inputSchema = requireSchemaObject(
        requireInputSchema(doc, 'referencedChildren'),
        doc,
        'referencedChildren input',
      );
      const childrenSchema = requireSchemaObject(
        requireProperty(inputSchema, 'children'),
        doc,
        'referencedChildren input.children',
      );
      const childSchema = requireSchemaObject(
        requireArrayItemsSchema(childrenSchema),
        doc,
        'referencedChildren input.children[]',
      );
      const childNameSchema = requireSchemaObject(
        requireProperty(childSchema, 'name'),
        doc,
        'referencedChildren input.children[].name',
      );

      expect(childrenSchema.description).toBe('Child collection');
      expect(childNameSchema.description).toBe('Child name');
    });

    it('wraps referenced property leaf descriptions using allOf in generated output schema', () => {
      const outputSchema = requireOutputData({
        doc,
        procPath: 'referencedChildLeafOutput',
      });
      const childSchema = requireProperty(outputSchema, 'child');

      expect(isRef(childSchema)).toBe(false);
      if (isRef(childSchema)) {
        throw new Error('Expected child schema to be wrapped, not a bare $ref');
      }

      expect(childSchema.description).toBe('Recursive child');
      expect(childSchema.allOf?.[0]).toEqual({
        $ref: expect.stringMatching(/^#\/components\/schemas\//),
      });
    });

    it('still preserves JSDoc descriptions on operations', () => {
      const helloOp = requireOperation(doc, 'hello');
      expect(helloOp.description).toBe('Hello zod Procedure details');
    });

    it('produces a valid OpenAPI spec', async () => {
      const spec = JSON.stringify(doc, null, 2);
      const problems = await validateOpenAPI(spec);
      expect(problems).toEqual([]);
    });
  });

  describe('inline type JSDoc descriptions', () => {
    const descriptionsRouterPath = path.resolve(
      routersDir,
      'descriptionsRouter.ts',
    );
    let doc: Document;

    beforeAll(async () => {
      doc = await generateOpenAPIDocument(descriptionsRouterPath, {
        exportName: 'descriptionsRouter',
        title: 'Descriptions API',
        version: '1.0.0',
      });
    });

    it('extracts JSDoc from inline input type properties', () => {
      const inputSchema = requireSchemaObject(
        requireInputSchema(doc, 'helloInline'),
        doc,
        'helloInline input',
      );

      const nameSchema = requireSchemaObject(
        requireProperty(inputSchema, 'name'),
        doc,
        'helloInline input.name',
      );
      expect(nameSchema.description).toBe('doc comment on name');
    });

    it('resolves primitive type alias output to its base type', () => {
      // HelloGreeting is `type HelloGreeting = string` — the alias identity is
      // lost when resolved through tRPC's $types, so no description is expected.
      const outputSchema = requireOutputData({
        doc,
        procPath: 'helloInline',
      });

      expect(outputSchema.type).toBe('string');
    });

    it('extracts JSDoc from nested inline subrouter input properties', () => {
      const inputSchema = requireSchemaObject(
        requireInputSchema(doc, 'subrouterInline.hello'),
        doc,
        'subrouterInline.hello input',
      );
      const nameSchema = requireSchemaObject(
        requireProperty(inputSchema, 'name'),
        doc,
        'subrouterInline.hello input.name',
      );
      expect(nameSchema.description).toBe('doc comment on name');

      const childrenSchema = requireSchemaObject(
        requireProperty(inputSchema, 'children'),
        doc,
        'subrouterInline.hello input.children',
      );
      if (!isArraySchema(childrenSchema) || !childrenSchema.items) {
        throw new Error('Expected subrouterInline.hello input.children items');
      }
      const childSchema = requireSchemaObject(
        childrenSchema.items,
        doc,
        'subrouterInline.hello input.children[]',
      );
      expect(
        requireSchemaObject(
          requireProperty(childSchema, 'child'),
          doc,
          'subrouterInline.hello input.children[].child',
        ).description,
      ).toBe('Child name');
      expect(
        requireSchemaObject(
          requireProperty(childSchema, 'gender'),
          doc,
          'subrouterInline.hello input.children[].gender',
        ).description,
      ).toBe('Child gender');
    });

    it('extracts JSDoc from inline output type defined inside callback', () => {
      const outputSchema = requireOutputData({
        doc,
        procPath: 'subrouterInline.hello',
      });

      expect(
        requireSchemaObject(
          requireProperty(outputSchema, 'name'),
          doc,
          'subrouterInline.hello output.name',
        ).description,
      ).toBe('Name of the user');
      expect(
        requireSchemaObject(
          requireProperty(outputSchema, 'date'),
          doc,
          'subrouterInline.hello output.date',
        ).description,
      ).toBe('Date of the greeting');
    });

    it('extracts JSDoc from type alias used as input', () => {
      const inputSchema = requireSchemaObject(
        requireInputSchema(doc, 'directArrayInline', 'post'),
        doc,
        'directArrayInline input',
      );

      expect(inputSchema.description).toBe('Array of inputs strings');
    });

    it('extracts JSDoc from type alias used as output', () => {
      const outputSchema = requireOutputData({
        doc,
        procPath: 'directArrayInline',
        method: 'post',
      });

      expect(outputSchema.description).toBe('Array of output strings');
    });

    it('produces a valid OpenAPI spec', async () => {
      const spec = JSON.stringify(doc, null, 2);
      const problems = await validateOpenAPI(spec);
      expect(problems).toEqual([]);
    });
  });

  describe('superjson transformer', () => {
    let doc: Document;

    beforeAll(async () => {
      doc = await generateOpenAPIDocument(superjsonRouterPath, {
        exportName: 'SuperjsonRouter',
        title: 'Superjson API',
        version: '1.0.0',
      });
    });

    it('generates integer schema for bigint fields', () => {
      const inputSchema = requireSchemaObject(
        requireInputSchema(doc, 'getBigInt'),
        doc,
        'getBigInt input',
      );
      expect(requireProperty(inputSchema, 'amount')).toEqual({
        type: 'integer',
        format: 'bigint',
      });

      const responseSchema = requireOutputData({
        doc,
        procPath: 'getBigInt',
      });
      expect(requireProperty(responseSchema, 'amount')).toEqual({
        type: 'integer',
        format: 'bigint',
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
        // Only done like this for testing, do not remove
        querySerializer: createTRPCHeyApiClientConfig({
          transformer: superjson,
        }).querySerializer,
      });

      // Without superjson deserialization on the response, result.data
      // contains the tRPC envelope whose data is the raw superjson shape:
      // { json: { ... }, meta: { values: ... } }
      expect(result.error).not.toBeDefined();
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

      configureTRPCHeyApiClient(superjsonClient, {
        baseUrl,
        transformer: superjson,
      });

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

      // --- BigInt query with superjson on both ends ---
      const bigintResult = await sdk.getBigInt({
        query: {
          input: { id: 'bi_1', amount: BigInt(9007199254740991) },
        },
      });

      expect(bigintResult.data).toBeDefined();
      expect(bigintResult.data!.result.data).toEqual({
        id: 'bi_1',
        amount: BigInt(9007199254740991),
      });
    });
  });
});
