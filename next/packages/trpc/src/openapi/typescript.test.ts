import { Effect } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { HttpEffect } from 'effect/http';
import {
  generateOpenApi,
  openApiReference,
  type OpenApiDocument,
} from '@trpc12/trpc/openapi';
import { experimental_generateOpenApiFromTypes } from '@trpc12/trpc/openapi/typescript';
import { expect, test } from 'vite-plus/test';
import { appRouter } from './fixtures/typed-router.ts';
import { shapesRouter } from './fixtures/typed-shapes.ts';

type Op = {
  responses: Record<
    string,
    { content?: Record<string, { schema: Record<string, any> }> }
  >;
  requestBody?: { content: Record<string, { schema: unknown }> };
};
const op = (doc: OpenApiDocument, method: string, path: string) =>
  doc.paths[path]![method] as unknown as Op;
const json = (o: Op, status: string) =>
  o.responses[status]!.content!['application/json']!.schema;

const doc = await experimental_generateOpenApiFromTypes(appRouter, {
  file: new URL('./fixtures/typed-router.ts', import.meta.url),
  tsconfig: new URL('../../tsconfig.json', import.meta.url),
  info: { title: 'Posts', version: '1.0.0' },
});

test('inferred errors are documented with their status (21)', () => {
  const runtime = generateOpenApi(appRouter, {
    info: { title: 'Posts', version: '1.0.0' },
  });
  expect(Object.keys(op(runtime, 'get', '/api/posts/{id}').responses)).toEqual([
    '200',
    '400',
    'default',
  ]);

  expect(json(op(doc, 'get', '/api/posts/{id}'), '404')).toMatchObject({
    properties: {
      code: { const: 'POST_NOT_FOUND' },
      data: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  });
  expect(json(op(doc, 'post', '/api/posts'), '401')).toMatchObject({
    properties: { code: { const: 'UNAUTHORIZED' } },
  });
  expect(
    json(op(doc, 'post', '/api/posts'), '401')['properties'],
  ).not.toHaveProperty('data');
  expect(json(op(doc, 'get', '/api/posts/count'), '409')).toMatchObject({
    properties: {
      code: { const: 'CONFLICT' },
      data: { properties: { reason: { const: 'too many' } } },
    },
  });
  expect(Object.keys(op(doc, 'get', '/api/posts').responses)).toEqual([
    '200',
    'default',
  ]);
});

test('procedures without static schemas get their inferred types (21)', () => {
  const post = json(op(doc, 'get', '/api/posts'), '200');
  expect(post['type']).toBe('array');
  expect(post['items']).toEqual({
    type: 'object',
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      publishedAt: {
        anyOf: [{ type: 'null' }, { type: 'string', format: 'date-time' }],
        description: 'When it was published.',
      },
      tags: { type: 'array', items: { type: 'string' } },
      status: { enum: ['draft', 'published'] },
      meta: {
        type: 'object',
        properties: { views: { type: 'number' } },
        required: ['views'],
      },
    },
    required: ['id', 'title', 'publishedAt', 'tags', 'status'],
  });

  // A ctx-callback input has no static schema; its type documents the body.
  expect(
    op(doc, 'post', '/api/posts').requestBody!.content['application/json']!
      .schema,
  ).toEqual({
    type: 'object',
    properties: { title: { type: 'string' } },
    required: ['title'],
  });

  // Branded primitives are their primitive, bigint is left out (JSON can't
  // send it) and recursive types are components.
  expect(json(op(doc, 'get', '/api/posts/{id}/comments'), '200')).toEqual({
    type: 'object',
    properties: {
      postId: { type: 'string' },
      comments: {
        type: 'array',
        items: { $ref: '#/components/schemas/post.comments.output.Comment' },
      },
      total: { type: 'number' },
    },
    required: ['postId', 'comments', 'total'],
  });
  expect(doc.components.schemas['post.comments.output.Comment']).toEqual({
    type: 'object',
    properties: {
      text: { type: 'string' },
      replies: {
        type: 'array',
        items: { $ref: '#/components/schemas/post.comments.output.Comment' },
      },
    },
    required: ['text', 'replies'],
  });

  // tracked() events document their data.
  const events = op(doc, 'get', '/api/posts/events').responses['200']!.content![
    'text/event-stream'
  ]!.schema;
  expect(events['properties']).toHaveProperty('publishedAt');
});

test('runtime schemas win over types (21)', () => {
  const runtime = generateOpenApi(appRouter, {
    info: { title: 'Posts', version: '1.0.0' },
  });
  expect(json(op(doc, 'get', '/api/posts/count'), '200')).toEqual(
    json(op(runtime, 'get', '/api/posts/count'), '200'),
  );
  expect(doc.paths['/api/posts/{id}']!['get']!.parameters).toEqual(
    runtime.paths['/api/posts/{id}']!['get']!.parameters,
  );
});

test('openApiReference serves a document generated at build time (21)', async () => {
  const handler = HttpEffect.toWebHandler(
    openApiReference({ document: doc })(
      Effect.succeed(HttpServerResponse.text('app')),
    ) as Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      never,
      HttpServerRequest.HttpServerRequest
    >,
  );
  const spec = (await (
    await handler(new Request('http://localhost:4000/api/openapi.json'))
  ).json()) as OpenApiDocument;
  expect(spec.servers).toEqual([{ url: 'http://localhost:4000' }]);
  expect(spec.paths).toHaveProperty('/api/posts/{id}');
  const html = await (
    await handler(new Request('http://localhost:4000/api/docs'))
  ).text();
  expect(html).toContain('<title>Posts</title>');
  expect(
    await (await handler(new Request('http://localhost:4000/other'))).text(),
  ).toBe('app');
});

test('types document as JSON.stringify sends them (21)', async () => {
  const shapes = await experimental_generateOpenApiFromTypes(shapesRouter, {
    file: 'packages/trpc/src/openapi/fixtures/typed-shapes.ts',
    exportName: 'shapesRouter',
    info: { title: 'Shapes', version: '1.0.0' },
  });
  const binary = {
    type: 'string',
    contentMediaType: 'application/octet-stream',
  };
  expect(json(op(shapes, 'get', '/api/shapes'), '200')).toEqual({
    type: 'object',
    properties: {
      flag: { type: 'boolean' },
      either: { anyOf: [{ type: 'null' }, { type: 'boolean' }] },
      anything: {},
      loose: {},
      nothing: { not: {} },
      // `undefined` in an array is sent as `null`.
      pair: {
        type: 'array',
        prefixItems: [{ type: 'string' }, { type: 'number' }, { type: 'null' }],
        minItems: 3,
        maxItems: 3,
      },
      file: binary,
      upload: binary,
      tags: { type: 'object' },
      lookup: { type: 'object' },
      failure: { type: 'object' },
      // A class with `toJSON` is what `toJSON` returns.
      price: {
        type: 'object',
        properties: { amount: { type: 'string' }, currency: { const: 'EUR' } },
        required: ['amount', 'currency'],
      },
      counts: {
        type: 'object',
        properties: {},
        additionalProperties: { type: 'number' },
      },
      mixed: { enum: ['a', 1, true] },
      maybe: { type: 'string' },
      voided: { type: 'string' },
      holes: { type: 'array', items: { type: 'null' } },
      when: { type: 'string' },
      upper: { type: 'string' },
      sparse: { type: 'object', properties: {}, additionalProperties: {} },
      // A computed enum member is a number.
      level: { type: 'number' },
      // A recursive type without a name is named after its id.
      chain: {
        type: 'object',
        properties: {
          next: {
            anyOf: [
              { type: 'null' },
              {
                $ref: expect.stringMatching(
                  /^#\/components\/schemas\/shapes\.output\.Type\d+$/,
                ),
              },
            ],
          },
        },
        required: ['next'],
      },
      // A `toJSON` that isn't a method is just a property.
      labelled: {
        type: 'object',
        properties: { toJSON: { type: 'string' }, text: { type: 'string' } },
        required: ['toJSON', 'text'],
      },
    },
    // Functions, methods, symbol keys, `undefined` and `bigint` aren't sent.
    required: [
      'flag',
      'either',
      'anything',
      'loose',
      'nothing',
      'pair',
      'file',
      'upload',
      'tags',
      'lookup',
      'failure',
      'price',
      'counts',
      'mixed',
      'holes',
      'when',
      'upper',
      'sparse',
      'level',
      'chain',
      'labelled',
    ],
  });
  const [anonymous] = Object.entries(shapes.components.schemas).filter(([k]) =>
    /^shapes\.output\.Type\d+$/.test(k),
  );
  expect(anonymous![1]).toMatchObject({
    properties: { depth: { type: 'number' } },
    required: ['next', 'depth'],
  });
  const coded = op(shapes, 'get', '/api/coded');
  expect(
    Object.entries(coded.responses).map(([status, r]) => [
      status,
      r.content?.['application/json']?.schema['properties']?.code?.const,
    ]),
  ).toEqual([
    ['200', undefined],
    ['400', 'SOMETHING_ODD'],
    ['403', 'FORBIDDEN'],
    ['409', 'CONFLICT'],
    ['default', undefined],
  ]);
  // A code only known as `string` has no response of its own.
  expect(Object.keys(op(shapes, 'get', '/api/vague').responses)).toEqual([
    '200',
    'default',
  ]);
  expect(json(op(shapes, 'get', '/api/empty'), '200')).toEqual({});
  expect(json(op(shapes, 'get', '/api/callable'), '200')).toEqual({});
  const failing = op(shapes, 'get', '/api/failing');
  expect(Object.keys(failing.responses)).toEqual([
    '200',
    '403',
    '429',
    'default',
  ]);
  expect(json(failing, '200')).toEqual({ const: 'ok' });
  // Lazy subtrees are read through their types.
  expect(json(op(shapes, 'get', '/api/later'), '200')).toEqual({
    type: 'number',
  });
});

test('a file outside a project, or without the export, is an error (21)', async () => {
  await expect(
    experimental_generateOpenApiFromTypes(shapesRouter, {
      file: new URL('./fixtures/typed-shapes.ts', import.meta.url),
      exportName: 'missingRouter',
      info: { title: 'Shapes', version: '1.0.0' },
    }),
  ).rejects.toThrow(`doesn't export "missingRouter"`);
  await expect(
    experimental_generateOpenApiFromTypes(shapesRouter, {
      file: '/nowhere/router.ts',
      info: { title: 'Shapes', version: '1.0.0' },
    }),
  ).rejects.toThrow('is not in a TypeScript project');
});
