import { Effect } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import { HttpEffect } from 'effect/http';
import {
  generateOpenApi,
  openApiReference,
  type OpenApiDocument,
} from 'trpcdev/openapi';
import { unstable_generateOpenApiFromTypes } from 'trpcdev/openapi/typescript';
import { beforeAll, expect, test } from 'vite-plus/test';
import { appRouter } from './fixtures/typed-router.ts';

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

let doc: OpenApiDocument;
beforeAll(async () => {
  doc = await unstable_generateOpenApiFromTypes(appRouter, {
    file: new URL('./fixtures/typed-router.ts', import.meta.url),
    tsconfig: new URL('./tsconfig.json', import.meta.url),
    info: { title: 'Posts', version: '1.0.0' },
  });
}, 60_000);

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
      status: { const: 404 },
      data: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  });
  expect(json(op(doc, 'post', '/api/posts'), '401')).toMatchObject({
    properties: { code: { const: 'UNAUTHORIZED' }, status: { const: 401 } },
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
