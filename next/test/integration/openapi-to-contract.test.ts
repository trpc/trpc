import { Schema } from 'effect';
import { createTrpcClient, safe } from 'trpcdev/client';
import { toContract } from 'trpcdev/contract';
import {
  createOpenApiHandler,
  generateContractFromOpenApi,
  generateOpenApi,
  openApiLink,
} from 'trpcdev/openapi';
import { error, initTrpc, tracked } from 'trpcdev/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { appContract } from './fixtures/contract.ts';

const t = initTrpc<{ ctx: {}; meta: { auth?: boolean } }>();
const impl = t.implement(appContract);
const router = impl.router({
  health: impl.health.query(() => 'ok' as const),
  post: {
    byId: impl.post.byId.query(({ input }) =>
      input.id === 'nope'
        ? error({ code: 'NOT_FOUND', data: { id: input.id } })
        : { id: input.id, title: 'Hello' },
    ),
    create: impl.post.create.mutation(({ input }) => ({
      id: '2',
      title: input.title,
    })),
    onAdd: impl.post.onAdd.subscription(async function* () {
      yield tracked('1', { id: '1', title: 'One' });
    }),
  },
});

test('a trpcdev document round-trips into a contract openApiLink can call', async () => {
  const doc = generateOpenApi(router, { info: { title: 'x', version: '1' } });
  const source = generateContractFromOpenApi(doc, {
    prefix: '/api',
    exportName: 'generated',
  });
  await expect(source).toMatchFileSnapshot(
    './fixtures/generated/app-contract.ts',
  );

  const { generated } = await import('./fixtures/generated/app-contract.ts');
  const json = toContract(generated);
  expect(json.procedures['post.byId']?.route).toEqual({
    method: 'GET',
    path: '/posts/{id}',
  });

  const handler = createOpenApiHandler({ router });
  const client = createTrpcClient({
    router: json,
    links: [
      openApiLink({
        url: 'http://localhost',
        contract: json,
        fetch: (input, init) => handler.fetch(new Request(input, init)),
      }),
    ],
  });
  const post = await client.post.byId.query({ id: '1' });
  expectTypeOf(post.title).toEqualTypeOf<string>();
  expect(post).toEqual({ id: '1', title: 'Hello' });

  const [, err] = await safe(client.post.byId.query({ id: 'nope' }));
  expect(err).toMatchObject({ code: 'NOT_FOUND', defined: true });
  if (err?.defined && err.code === 'NOT_FOUND') {
    expectTypeOf(err.data.id).toEqualTypeOf<string>();
    expect(err.data.id).toBe('nope');
  }

  expect(await client.post.create.mutate({ title: 'New' })).toEqual({
    id: '2',
    title: 'New',
  });
  await handler.dispose();
});

test('an OpenAPI 3.0 document: components, nullable, query parameters, status codes', async () => {
  const petstore = {
    openapi: '3.0.3',
    paths: {
      '/pets': {
        get: {
          operationId: 'pets.list',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            {
              name: 'status',
              in: 'query',
              required: true,
              schema: { type: 'string', enum: ['available', 'sold'] },
            },
          ],
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Pet' },
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: 'pets.add',
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/NewPet' },
              },
            },
          },
          responses: {
            '201': {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Pet' },
                },
              },
            },
          },
        },
      },
      '/pets/{petId}': {
        delete: {
          parameters: [
            {
              name: 'petId',
              in: 'path',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: { '204': { description: 'Deleted' } },
        },
      },
    },
    components: {
      schemas: {
        NewPet: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            tag: { type: 'string', nullable: true },
          },
        },
        Pet: {
          allOf: [
            { $ref: '#/components/schemas/NewPet' },
            {
              type: 'object',
              required: ['id'],
              properties: { id: { type: 'integer' } },
            },
          ],
        },
      },
    },
  };
  const source = generateContractFromOpenApi(petstore, {
    exportName: 'petstore',
  });
  await expect(source).toMatchFileSnapshot('./fixtures/generated/petstore.ts');

  const { petstore: generated, Pet } =
    await import('./fixtures/generated/petstore.ts');
  expect(
    Schema.decodeUnknownSync(Pet)({ id: 1, name: 'Rex', tag: null }),
  ).toEqual({ id: 1, name: 'Rex', tag: null });
  const json = toContract(generated);
  expect(
    Object.fromEntries(
      Object.entries(json.procedures).map(([path, p]) => [
        path,
        [p.type, p.route],
      ]),
    ),
  ).toEqual({
    'pets.list': ['query', { method: 'GET', path: '/pets' }],
    'pets.add': [
      'mutation',
      { method: 'POST', path: '/pets', successStatus: 201 },
    ],
    deletePetsPetId: [
      'mutation',
      { method: 'DELETE', path: '/pets/{petId}', successStatus: 204 },
    ],
  });
});

test('two operations on one procedure path are rejected', () => {
  expect(() =>
    generateContractFromOpenApi({
      openapi: '3.1.0',
      paths: {
        '/a': { get: { operationId: 'x', responses: {} } },
        '/b': { get: { operationId: 'x', responses: {} } },
      },
    }),
  ).toThrow('two operations map to "x"');
});
