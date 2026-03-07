import { z } from 'zod';
import { initTRPC } from '../../../@trpc/server';
import { resolveResponse } from './resolveResponse';

test('serves OpenAPI document on configured path', async () => {
  const t = initTRPC.create();
  const router = t.router({
    hello: t.procedure
      .input(z.object({ name: z.string() }))
      .output(z.object({ greeting: z.string() }))
      .query(() => ({ greeting: 'hello' })),
    post: t.router({
      create: t.procedure
        .input(z.object({ title: z.string() }))
        .output(z.object({ id: z.string() }))
        .mutation(() => ({ id: '1' })),
    }),
  });

  const response = await resolveResponse({
    router,
    req: new Request('http://localhost/docs/openapi.json'),
    path: 'openapi',
    createContext: async () => ({}),
    error: null,
    openApi: {
      enabled: true,
      path: 'docs/openapi.json',
    },
  });
  const json = await response.json();

  expect(response.status).toBe(200);
  expect(json).toMatchObject({
    openapi: '3.1.0',
    paths: {
      '/hello': {
        get: {
          operationId: 'hello',
        },
      },
      '/post/create': {
        post: {
          operationId: 'post.create',
        },
      },
    },
  });
  expect(
    json.paths['/post/create'].post.requestBody.content['application/json']
      .schema.type,
  ).toBe('object');
});

test('uses custom OpenAPI schema serializer when provided', async () => {
  const t = initTRPC.create();
  const router = t.router({
    hello: t.procedure.output(z.string()).query(() => 'ok'),
  });
  const serializer = vi.fn(() => ({ type: 'string', format: 'custom' }));

  const response = await resolveResponse({
    router,
    req: new Request('http://localhost/openapi.json'),
    path: 'openapi',
    createContext: async () => ({}),
    error: null,
    openApi: {
      enabled: true,
      schemaSerializer: serializer,
    },
  });
  const json = await response.json();

  expect(serializer).toHaveBeenCalledTimes(1);
  expect(
    json.paths['/hello'].get.responses[200].content['application/json'].schema,
  ).toEqual({
    type: 'string',
    format: 'custom',
  });
});

test('does not serve OpenAPI document when disabled', async () => {
  const t = initTRPC.create();
  const router = t.router({
    hello: t.procedure.query(() => 'ok'),
  });

  const response = await resolveResponse({
    router,
    req: new Request('http://localhost/openapi.json'),
    path: 'openapi.json',
    createContext: async () => ({}),
    error: null,
  });
  const json = await response.json();

  expect(response.status).toBe(404);
  expect(json).toMatchObject({
    error: {
      data: {
        code: 'NOT_FOUND',
      },
    },
  });
});
