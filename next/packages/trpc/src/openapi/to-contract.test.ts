import { Schema } from 'effect';
import { createTrpcClient, safe } from '@trpc12/trpc/client';
import { toContract } from '@trpc12/trpc/contract';
import {
  createOpenApiHandler,
  generateContractFromOpenApi,
  generateOpenApi,
  openApiLink,
  openapi,
  type OpenApiSource,
} from '@trpc12/trpc/openapi';
import { error, initTrpc, tracked } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { appContract } from '../fixtures/contract.ts';

const t = initTrpc<{ ctx: {}; meta: { auth?: boolean } }>().concat(openapi());
const impl = t.implement(appContract);
const router = impl.router({
  health: impl.health.query(() => 'ok' as const),
  post: {
    byId: impl.post.byId.query(({ input }) =>
      input.id === 'nope'
        ? error({ code: 'NOT_FOUND', data: { id: input.id } })
        : { id: input.id, title: 'Hello' },
    ),
    create: impl.post.create.mutation((opts) => ({
      id: '2',
      title: opts.input.title,
    })),
    onAdd: impl.post.onAdd.subscription(async function* () {
      yield tracked('1', { id: '1', title: 'One' });
    }),
  },
});

test('a @trpc12/trpc document round-trips into a contract openApiLink can call', async () => {
  const doc = generateOpenApi(router, { info: { title: 'x', version: '1' } });
  const source = generateContractFromOpenApi(doc, {
    prefix: '/api',
    exportName: 'generated',
  });
  await expect(source).toMatchFileSnapshot(
    './fixtures/generated/app-contract.ts',
  );

  const mod = await import('./fixtures/generated/app-contract.ts');
  const json = toContract(mod.generated);
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
  const petstore: OpenApiSource = {
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

  const mod = await import('./fixtures/generated/petstore.ts');
  expect(
    Schema.decodeUnknownSync(mod.Pet)({ id: 1, name: 'Rex', tag: null }),
  ).toEqual({ id: 1, name: 'Rex', tag: null });
  const json = toContract(mod.petstore);
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

test('recursive components, untyped and merged parameters, a prefix-only path and undeclared errors', async () => {
  const doc: OpenApiSource = {
    openapi: '3.1.0',
    paths: {
      '/api': { get: { operationId: 'root' } },
      '/api/trees/{id}': {
        put: {
          operationId: 'trees.2nd',
          parameters: [{ name: 'id', in: 'path' }],
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Tree' },
              },
            },
          },
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Tree' },
                },
              },
            },
            '404': { description: 'no body' },
            '409': {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Conflict' },
                },
              },
            },
            '500': {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Missing' },
                },
              },
            },
          },
        },
      },
      '/api/notes': {
        post: {
          operationId: 'notes.add',
          parameters: [
            { name: 'draft', in: 'query', schema: { type: 'boolean' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { text: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { ok: {} } },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Tree: {
          type: 'object',
          required: ['value'],
          properties: {
            value: { type: 'string' },
            children: {
              type: 'array',
              items: { $ref: '#/components/schemas/Tree' },
            },
          },
        },
        Conflict: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { const: 'CONFLICT' },
            data: {
              type: 'object',
              required: ['at'],
              properties: { at: { type: 'string' } },
            },
          },
        },
      },
    },
  };
  const source = generateContractFromOpenApi(doc, { prefix: '/api/' });
  await expect(source).toMatchFileSnapshot('./fixtures/generated/edges.ts');

  const mod = await import('./fixtures/generated/edges.ts');
  expect(
    Schema.decodeUnknownSync(mod.Tree)({
      value: 'a',
      children: [{ value: 'b', children: [] }],
    }),
  ).toEqual({ value: 'a', children: [{ value: 'b', children: [] }] });
  expect(() =>
    Schema.decodeUnknownSync(mod.Tree)({ value: 'a', children: [{}] }),
  ).toThrow('Missing key');

  const json = toContract(mod.contract);
  expect(
    Object.fromEntries(
      Object.entries(json.procedures).map(([path, p]) => [path, p.route]),
    ),
  ).toEqual({
    root: { method: 'GET', path: '/' },
    'trees.2nd': { method: 'PUT', path: '/trees/{id}' },
    'notes.add': { method: 'POST', path: '/notes' },
  });

  const s = initTrpc<{ ctx: {} }>().concat(openapi());
  const impl = s.implement(mod.contract);
  const server = impl.router({
    root: impl.root.query(() => undefined),
    trees: {
      '2nd': impl.trees['2nd'].mutation(({ input }) =>
        input.id === 'taken'
          ? error({ code: 'CONFLICT', data: { at: input.value } })
          : {
              value: `${input.id}:${input.value}`,
              children: input.children ?? [],
            },
      ),
    },
    notes: {
      add: impl.notes.add.mutation((opts) => ({
        ok: [opts.input.draft ?? null, opts.input.text ?? null],
      })),
    },
  });
  const handler = createOpenApiHandler({ router: server });
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
  expect(await client.root.query()).toBeUndefined();
  expect(
    await client.trees['2nd'].mutate({
      id: 'x',
      value: 'v',
      children: [{ value: 'c' }],
    }),
  ).toEqual({ value: 'x:v', children: [{ value: 'c' }] });
  const [, err] = await safe(
    client.trees['2nd'].mutate({ id: 'taken', value: 'v' }),
  );
  expect(err).toMatchObject({ code: 'CONFLICT', data: { at: 'v' } });
  expect(await client.notes.add.mutate({ draft: true })).toEqual({
    ok: [true, null],
  });
  await handler.dispose();
});

test('an operation cannot also be a namespace', () => {
  expect(() =>
    generateContractFromOpenApi({
      openapi: '3.1.0',
      paths: {
        '/a': { get: { operationId: 'a', responses: {} } },
        '/b': { get: { operationId: 'a.b', responses: {} } },
      },
    }),
  ).toThrow('"a.b" nests under the operation "a"');
  expect(generateContractFromOpenApi({ openapi: '3.1.0' })).toContain(
    'export const contract = {\n};',
  );
});
