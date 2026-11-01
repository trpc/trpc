import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NodeHttpServer } from '@effect/platform-node';
import { Context, Effect, Exit, Layer, Schema, Scope } from 'effect';
import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { experimental_toContract } from '@trpc12/trpc/contract';
import { serve as serveHttp } from '@trpc12/trpc/http';
import {
  experimental_createOpenApiHandler,
  experimental_generateOpenApi,
  experimental_openapi,
  type OpenApiErrorBody,
  experimental_openApiLink,
  experimental_openApiReference,
  experimental_parseBracketNotation,
  experimental_toBracketNotation,
} from '@trpc12/trpc/openapi';
import {
  type AnyRouter,
  createFetchHandler,
  initTrpc,
  tracked,
  type TrackedEnvelope,
} from '@trpc12/trpc/server';
import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
import { z } from 'zod';
import { appContract } from '../fixtures/contract.ts';

interface Ctx {
  user: string | null;
}
const t = initTrpc<{ ctx: Ctx }>().concat(experimental_openapi());

class Clock extends Context.Service<Clock, { now: () => number }>()('Clock') {}

const Post = z.object({ id: z.string(), title: z.string() });
const posts = new Map([
  ['1', { id: '1', title: 'Hello' }],
  ['2', { id: '2', title: 'World' }],
]);

const router = t.router({
  health: t.procedure.query(() => 'ok' as const),
  post: {
    byId: t.procedure
      .meta({
        route: {
          method: 'GET',
          path: '/posts/{id}',
          tags: ['posts'],
          summary: 'Get a post',
        },
      })
      .input(z.object({ id: z.string() }))
      .output(Post)
      .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
      .query(
        (opts) =>
          posts.get(opts.input.id) ??
          opts.errors.NOT_FOUND({ data: { id: opts.input.id } }),
      ),
    latest: t.procedure
      .meta({ route: { method: 'GET', path: '/posts/latest' } })
      .output(Post)
      .query(() => posts.get(String(posts.size))!),
    list: t.procedure
      .meta({ route: { method: 'GET', path: '/posts' } })
      .input(
        z.object({
          limit: z.number().int().max(50),
          tags: z.array(z.string()).optional(),
          author: z.object({ name: z.string() }).optional(),
          published: z.boolean().optional(),
        }),
      )
      .query((opts) => opts.input),
    create: t.procedure
      .meta({ route: { method: 'POST', path: '/posts', successStatus: 201 } })
      .input(z.object({ title: z.string().min(1) }))
      .output(Post)
      .errors({ UNAUTHORIZED: {} })
      .mutation((opts) => {
        if (!opts.ctx.user) return opts.errors.UNAUTHORIZED();
        const post: z.infer<typeof Post> = {
          id: String(posts.size + 1),
          title: opts.input.title,
        };
        posts.set(post.id, post);
        return post;
      }),
    update: t.procedure
      .meta({
        route: {
          method: 'PATCH',
          path: '/posts/{id}',
          inputStructure: 'detailed',
          outputStructure: 'detailed',
        },
      })
      .input(
        z.object({
          params: z.object({ id: z.string() }),
          query: z.object({ notify: z.boolean().optional() }),
          headers: z.object({ 'if-match': z.string() }),
          body: z.object({ title: z.string() }),
        }),
      )
      .mutation(({ input }) => ({
        status: 200,
        headers: { etag: `${input.headers['if-match']}+1` },
        body: {
          id: input.params.id,
          title: input.body.title,
          notified: input.query.notify ?? false,
        },
      })),
    remove: t.procedure
      .meta({ route: { method: 'DELETE', path: '/posts/{id}' } })
      .input(z.object({ id: z.string() }))
      .mutation((opts) => {
        posts.delete(opts.input.id);
        opts.response.status = 204;
      }),
    onAdd: t.procedure.output(Post).subscription(async function* (opts) {
      for (let id = Number(opts.lastEventId ?? 0) + 1; id <= 3; id++) {
        yield tracked(String(id), { id: String(id), title: `Post ${id}` });
      }
    }),
    upload: t.procedure
      .meta({ route: { method: 'POST', path: '/files' } })
      .input(z.object({ name: z.string(), file: z.instanceof(File) }))
      .mutation(async ({ input }) => ({
        name: input.name,
        size: input.file.size,
        text: await input.file.text(),
      })),
  },
  stats: t.procedure
    .meta({ route: { method: 'GET', path: '/stats' } })
    .input(Schema.Struct({ days: Schema.Number }))
    .query((opts) =>
      Effect.gen(function* () {
        const clock = yield* Clock;
        return { days: opts.input.days, at: clock.now() };
      }),
    ),
  boom: t.procedure.query(() => {
    throw new Error('secret detail');
  }),
});

const layer = Layer.succeed(Clock, { now: () => 42 });

async function serve(opts: { expose?: boolean } = {}) {
  const createContext = (args: {
    request: { headers: Record<string, string | undefined> };
  }) => ({
    user: args.request.headers['x-user'] ?? null,
  });
  const rpc = createFetchHandler({ router, createContext, layer });
  const openapi = experimental_createOpenApiHandler({
    router,
    createContext,
    layer,
    exposeUnexpectedErrors: opts.expose ?? true,
    middleware: [
      experimental_openApiReference({
        router,
        specGenerateOptions: { info: { title: 'Posts API', version: '1.0.0' } },
      }),
      experimental_openApiReference({
        path: '/api/swagger',
        specPath: '/api/swagger.json',
        docsProvider: 'swagger',
        document: () =>
          experimental_generateOpenApi(router, {
            info: { title: 'Posts API', version: '1.0.0' },
          }),
      }),
    ],
  });
  const server = createServer();
  const scope = Scope.makeUnsafe();
  await Effect.runPromise(
    Layer.buildWithScope(
      serveHttp({
        fetch: (request) =>
          new URL(request.url).pathname.startsWith('/trpc')
            ? rpc.fetch(request)
            : openapi.fetch(request),
      }).pipe(
        Layer.provideMerge(
          NodeHttpServer.layer(() => server, { port: 0, host: '127.0.0.1' }),
        ),
      ),
      scope,
    ),
  );
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    api: (path: string, init?: RequestInit) =>
      fetch(`${origin}/api${path}`, init),
    async [Symbol.asyncDispose]() {
      server.closeAllConnections();
      await Effect.runPromise(Scope.close(scope, Exit.void));
      await Promise.all([rpc.dispose(), openapi.dispose()]);
    },
  };
}

test('procedures answer at their routes, with path params and declared errors (18 O-A)', async () => {
  await using s = await serve();
  const ok = await s.api('/posts/1');
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ id: '1', title: 'Hello' });

  expect(await (await s.api('/posts/latest')).json()).toMatchObject({
    id: String(posts.size),
  });

  const missing = await s.api('/posts/nope');
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({
    defined: true,
    code: 'NOT_FOUND',
    message: 'NOT_FOUND',
    data: { id: 'nope' },
  } satisfies OpenApiErrorBody);

  expect(await (await s.api('/health')).json()).toBe('ok');
  expect((await s.api('/posts/1', { method: 'PUT' })).status).toBe(405);
  expect((await s.api('/nowhere')).status).toBe(404);
});

test('query strings use bracket notation, coerced from the JSON Schema', async () => {
  await using s = await serve();
  const res = await s.api(
    '/posts?limit=5&tags[]=a&tags[]=b&author[name]=ada&published=true',
  );
  expect(await res.json()).toEqual({
    limit: 5,
    tags: ['a', 'b'],
    author: { name: 'ada' },
    published: true,
  });

  const repeated = await s.api('/posts?limit=1&tags=x&tags=y&tags=z');
  expect(await repeated.json()).toEqual({ limit: 1, tags: ['x', 'y', 'z'] });

  const single = await s.api('/posts?limit=1&tags=only');
  expect(await single.json()).toEqual({ limit: 1, tags: ['only'] });

  const invalid = await s.api('/posts?limit=500');
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({
    defined: true,
    code: 'BAD_REQUEST',
    tag: 'InvalidInput',
    data: { issues: [{ path: ['limit'] }] },
  });

  const effect = await s.api('/stats?days=7');
  expect(await effect.json()).toEqual({ days: 7, at: 42 });
});

test('bodies: JSON, forms and files; status from the route meta and the response handle', async () => {
  await using s = await serve();
  const created = await s.api('/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user': 'ada' },
    body: JSON.stringify({ title: 'New' }),
  });
  expect(created.status).toBe(201);
  const post = (await created.json()) as { id: string };
  expect(post).toMatchObject({ title: 'New' });

  const unauthorized = await s.api('/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'New' }),
  });
  expect(unauthorized.status).toBe(401);

  const form = await s.api('/posts', {
    method: 'POST',
    headers: { 'x-user': 'ada' },
    body: new URLSearchParams({ title: 'From a form' }),
  });
  expect(await form.json()).toMatchObject({ title: 'From a form' });

  const files = new FormData();
  files.append('name', 'notes');
  files.append('file', new File(['hello'], 'notes.txt'));
  const uploaded = await s.api('/files', { method: 'POST', body: files });
  expect(await uploaded.json()).toEqual({
    name: 'notes',
    size: 5,
    text: 'hello',
  });

  const removed = await s.api(`/posts/${post.id}`, { method: 'DELETE' });
  expect(removed.status).toBe(204);
  expect(await removed.text()).toBe('');

  const text = await s.api('/posts', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: 'hi',
  });
  expect(text.status).toBe(415);
});

test('detailed input and output structures', async () => {
  await using s = await serve();
  const res = await s.api('/posts/7?notify=true', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'if-match': 'v1' },
    body: JSON.stringify({ title: 'Edited' }),
  });
  expect(res.status).toBe(200);
  expect(res.headers.get('etag')).toBe('v1+1');
  expect(await res.json()).toEqual({
    id: '7',
    title: 'Edited',
    notified: true,
  });

  const missingHeader = await s.api('/posts/7', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Edited' }),
  });
  expect(missingHeader.status).toBe(400);
});

test('subscriptions are text/event-stream and resume from Last-Event-ID', async () => {
  await using s = await serve();
  const res = await s.api('/post/onAdd', { headers: { 'last-event-id': '1' } });
  expect(res.headers.get('content-type')).toBe('text/event-stream');
  const body = await res.text();
  expect(body).toContain(
    'id: 2\nevent: message\ndata: {"id":"2","title":"Post 2"}',
  );
  expect(body).toContain('id: 3\n');
  expect(body).not.toContain('id: 1\n');
  expect(body).toContain('event: done');
});

test('unexpected errors are masked unless exposed', async () => {
  await using masked = await serve({ expose: false });
  const res = await masked.api('/boom');
  expect(res.status).toBe(500);
  expect(await res.json()).toMatchObject({
    defined: false,
    message: 'Internal server error',
  });
});

test('the same router serves RPC and REST at once', async () => {
  await using s = await serve();
  const rpc = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: `${s.origin}/trpc` })],
  });
  expect(await rpc.post.byId.query({ id: '1' })).toEqual({
    id: '1',
    title: 'Hello',
  });
  expect(await (await s.api('/posts/1')).json()).toEqual({
    id: '1',
    title: 'Hello',
  });
});

test('experimental_openApiLink calls the REST endpoints from a JSON contract (18 (d))', async () => {
  await using s = await serve();
  const contract = JSON.parse(
    JSON.stringify(experimental_toContract(router)),
  ) as ReturnType<typeof experimental_toContract<typeof router>>;
  const requests: string[] = [];
  const client = createTrpcClient({
    router: contract,
    links: [
      experimental_openApiLink({
        url: s.origin,
        contract,
        headers: { 'x-user': 'ada' },
        fetch: (input, init) => {
          requests.push(`${init.method} ${input.slice(s.origin.length)}`);
          return fetch(input, init);
        },
      }),
    ],
  });

  const post = await client.post.byId.query({ id: '1' });
  expectTypeOf(post).toEqualTypeOf<{ id: string; title: string }>();
  expect(post.title).toBe('Hello');

  const [, err] = await safe(client.post.byId.query({ id: 'nope' }));
  expect(err).toMatchObject({
    code: 'NOT_FOUND',
    defined: true,
    data: { id: 'nope' },
  });

  expect(
    await client.post.list.query({
      limit: 2,
      tags: ['a'],
      author: { name: 'x' },
    }),
  ).toEqual({ limit: 2, tags: ['a'], author: { name: 'x' } });

  const created = await client.post.create.mutate({ title: 'Linked' });
  expect(created.title).toBe('Linked');

  const updated = await client.post.update.mutate({
    params: { id: created.id },
    query: { notify: true },
    headers: { 'if-match': 'v9' },
    body: { title: 'Linked 2' },
  });
  expect(updated).toMatchObject({
    status: 200,
    headers: { etag: 'v9+1' },
    body: { id: created.id, title: 'Linked 2', notified: true },
  });

  const upload = await client.post.upload.mutate({
    name: 'a',
    file: new File(['abc'], 'a.txt'),
  });
  expect(upload).toEqual({ name: 'a', size: 3, text: 'abc' });

  const events: TrackedEnvelope<{ id: string; title: string }>[] = [];
  for await (const event of client.post.onAdd.subscribe(undefined, {
    lastEventId: '2',
  })) {
    events.push(event);
  }
  expect(events).toEqual([{ id: '3', data: { id: '3', title: 'Post 3' } }]);

  expect(await client.health.query()).toBe('ok');
  expect(requests).toEqual([
    'GET /api/posts/1',
    'GET /api/posts/nope',
    'GET /api/posts?limit=2&tags%5B%5D=a&author%5Bname%5D=x',
    'POST /api/posts',
    `PATCH /api/posts/${created.id}?notify=true`,
    'POST /api/files',
    'GET /api/post/onAdd',
    'GET /api/health',
  ]);
});

test('experimental_generateOpenApi documents routes, params, bodies and errors (18 (c))', () => {
  const doc = experimental_generateOpenApi(router, {
    info: { title: 'Posts API', version: '1.0.0' },
    servers: [{ url: 'https://api.example.com' }],
  });
  expect(doc.openapi).toBe('3.1.1');
  expect(Object.keys(doc.paths)).toEqual([
    '/api/health',
    '/api/posts/{id}',
    '/api/posts/latest',
    '/api/posts',
    '/api/post/onAdd',
    '/api/files',
    '/api/stats',
    '/api/boom',
  ]);

  const byId = doc.paths['/api/posts/{id}']!['get']!;
  expect(byId).toMatchObject({
    operationId: 'post.byId',
    summary: 'Get a post',
    tags: ['posts'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ],
  });
  expect(Object.keys(byId.responses)).toEqual(['200', '400', '404', 'default']);
  expect(byId.responses['404']).toMatchObject({
    content: {
      'application/json': {
        schema: {
          properties: {
            code: { const: 'NOT_FOUND' },
            data: { properties: { id: { type: 'string' } } },
          },
        },
      },
    },
  });

  const list = doc.paths['/api/posts']!['get']!;
  expect(list.parameters).toEqual([
    {
      name: 'limit',
      in: 'query',
      required: true,
      schema: expect.objectContaining({ type: 'integer' }),
    },
    {
      name: 'tags',
      in: 'query',
      required: false,
      schema: { type: 'array', items: { type: 'string' } },
    },
    {
      name: 'author',
      in: 'query',
      required: false,
      schema: expect.objectContaining({ type: 'object' }),
      style: 'deepObject',
      explode: true,
    },
    {
      name: 'published',
      in: 'query',
      required: false,
      schema: { type: 'boolean' },
    },
  ]);

  const create = doc.paths['/api/posts']!['post']!;
  expect(create.requestBody).toMatchObject({
    required: true,
    content: {
      'application/json': {
        schema: { properties: { title: { type: 'string', minLength: 1 } } },
      },
    },
  });
  expect(Object.keys(create.responses)).toEqual([
    '201',
    '400',
    '401',
    'default',
  ]);

  const update = doc.paths['/api/posts/{id}']!['patch']!;
  expect(update.parameters).toEqual([
    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    {
      name: 'notify',
      in: 'query',
      required: false,
      schema: { type: 'boolean' },
    },
    {
      name: 'if-match',
      in: 'header',
      required: true,
      schema: { type: 'string' },
    },
  ]);

  const remove = doc.paths['/api/posts/{id}']!['delete']!;
  expect(remove.requestBody).toBeUndefined();

  expect(doc.paths['/api/post/onAdd']!['get']!.responses['200']).toMatchObject({
    content: { 'text/event-stream': { schema: { type: 'object' } } },
  });
  expect(doc.paths['/api/stats']!['get']!.parameters).toEqual([
    expect.objectContaining({ name: 'days', in: 'query', required: true }),
  ]);
  expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
});

test("target: 'rpc' documents the RPC endpoint with zero configuration (O-C)", () => {
  const doc = experimental_generateOpenApi(router, {
    info: { title: 'RPC', version: '1.0.0' },
    target: 'rpc',
  });
  expect(doc.paths['/trpc/post.byId']!['get']).toMatchObject({
    parameters: [
      {
        name: 'input',
        in: 'query',
        required: true,
        content: {
          'application/json': { schema: { properties: { id: {} } } },
        },
      },
    ],
    responses: {
      '200': {
        content: {
          'application/json': {
            schema: { properties: { json: { type: 'object' } } },
          },
        },
      },
    },
  });
  expect(doc.paths['/trpc/post.create']!['post']!.requestBody).toMatchObject({
    content: {
      'application/json': {
        schema: { properties: { json: { properties: { title: {} } } } },
      },
    },
  });
});

test('a contract alone is enough to document an API', () => {
  const doc = experimental_generateOpenApi(appContract, {
    info: { title: 'Contract', version: '1.0.0' },
  });
  expect(doc.paths['/api/posts/{id}']!['get']!.operationId).toBe('post.byId');
  expect(doc.paths['/api/post/create']!['post']!.responses).toHaveProperty(
    '401',
  );
});

test('experimental_openApiReference middleware serves Scalar or Swagger UI and the document (18 (e), 21)', async () => {
  await using s = await serve();
  const html = await (await s.api('/docs')).text();
  expect(html).toContain('data-url="/api/openapi.json"');
  expect(html).toContain('@scalar/api-reference');

  const spec = (await (await s.api('/openapi.json')).json()) as {
    info: { title: string };
    servers: { url: string }[];
    paths: Record<string, unknown>;
  };
  expect(spec.info.title).toBe('Posts API');
  expect(spec.servers).toEqual([{ url: s.origin }]);
  expect(spec.paths).toHaveProperty('/api/posts/{id}');

  const swagger = await (await s.api('/swagger')).text();
  expect(swagger).toContain('SwaggerUIBundle');
  expect(swagger).toContain('"/api/swagger.json"');
});

test('two procedures on the same route are rejected', () => {
  expect(() =>
    experimental_createOpenApiHandler({
      router: t.router({
        a: t.procedure.meta({ route: { path: '/x/{id}' } }).query(() => 1),
        b: t.procedure.meta({ route: { path: '/x/{slug}' } }).query(() => 2),
      }),
      createContext: () => ({ user: null }),
    }),
  ).toThrow(/"b" and "a" both map to GET \/api\/x\/\{\}/);
});

test('bracket notation round-trips', () => {
  const value: Record<string, unknown> = {
    a: { b: '1', c: ['x', 'y'] },
    items: [{ id: '1' }, { id: '2' }],
    empty: '',
  };
  expect(
    experimental_parseBracketNotation(experimental_toBracketNotation(value)),
  ).toEqual(value);
  expect(
    experimental_parseBracketNotation(
      new URLSearchParams('__proto__[x]=1&a[constructor]=2'),
    ),
  ).toEqual({});
});

test('bracket notation keys named like built-in methods are plain fields', () => {
  expect(
    experimental_parseBracketNotation(
      new URLSearchParams(
        'toString=a&valueOf[x]=1&filter[hasOwnProperty][y]=2&tags[toString]=3',
      ),
    ),
  ).toEqual({
    toString: 'a',
    valueOf: { x: '1' },
    filter: { hasOwnProperty: { y: '2' } },
    tags: { toString: '3' },
  });
  expect(typeof Object.prototype.toString).toBe('function');
  expect(Object.prototype.hasOwnProperty.call({ a: 1 }, 'a')).toBe(true);
});

test('an unvalidated output is documented by its schema input side', () => {
  const t = initTrpc().concat(experimental_openapi());
  const doc = experimental_generateOpenApi(
    {
      when: t.procedure
        .meta({ route: { method: 'GET', path: '/when' } })
        .output(
          z.string().transform((s) => s.length),
          { validate: false },
        )
        .query(() => 'now'),
    },
    { info: { title: 'x', version: '1' } },
  );
  const ok = doc.paths['/api/when']!['get']!.responses['200'] as {
    content: Record<string, { schema: unknown }>;
  };
  expect(ok.content['application/json']!.schema).toMatchObject({
    type: 'string',
  });
});

test('quiet subscriptions send keep-alive comments', async () => {
  const handler = experimental_createOpenApiHandler({
    router: t.router({
      slow: t.procedure.subscription(async function* () {
        yield 'a';
        await new Promise((resolve) => setTimeout(resolve, 60));
        yield 'b';
      }),
    }),
    createContext: () => ({ user: null }),
    sse: { pingInterval: 10 },
  });
  const res = await handler.fetch(new Request('http://localhost/api/slow'));
  const text = await res.text();
  expect(text).toContain(': ping\n\n');
  expect(text).toContain('data: "b"');
  await handler.dispose();
});

test('a cancelled subscription sends no keep-alives while it winds down', async () => {
  let closed = false;
  const handler = experimental_createOpenApiHandler({
    router: t.router({
      slow: t.procedure.subscription(async function* () {
        try {
          yield 'a';
          await new Promise((resolve) => setTimeout(resolve, 60));
          yield 'b';
        } finally {
          closed = true;
        }
      }),
    }),
    createContext: () => ({ user: null }),
    sse: { pingInterval: 5 },
  });
  const res = await handler.fetch(new Request('http://localhost/api/slow'));
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes('data: "a"')) {
    text += decoder.decode((await reader.read()).value);
  }
  await reader.cancel();
  await vi.waitFor(() => expect(closed).toBe(true));
  await handler.dispose();
});

test('a subscription nobody reads waits instead of buffering its events', async () => {
  let yielded = 0;
  let closed = false;
  const handler = experimental_createOpenApiHandler({
    router: t.router({
      firehose: t.procedure.subscription(async function* () {
        try {
          while (yielded < 10_000) yield ++yielded;
        } finally {
          closed = true;
        }
      }),
    }),
    createContext: () => ({ user: null }),
  });
  const res = await handler.fetch(new Request('http://localhost/api/firehose'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(yielded).toBeLessThan(100);
  await res.body!.cancel();
  await vi.waitFor(() => expect(closed).toBe(true));
  expect(yielded).toBeLessThan(100);
  await handler.dispose();
});

test('serve() runs one procedure with params the caller matched', async () => {
  const handler = experimental_createOpenApiHandler({
    router: t.router({}),
    createContext: () => ({ user: 'ada' }),
  });
  const byId = t.procedure
    .meta({ route: { path: '/things/{id}', successStatus: 202 } })
    .input(z.object({ id: z.coerce.number(), q: z.string() }))
    .query((opts) => ({ ...opts.input, user: opts.ctx.user }));
  const res = await handler.serve(
    new Request('http://localhost/anywhere?q=x'),
    { path: 'things.byId', procedure: byId, params: { id: '7' } },
  );
  expect(res.status).toBe(202);
  expect(await res.json()).toEqual({ id: 7, q: 'x', user: 'ada' });
  await handler.dispose();
});

test('.meta({ route: { spec } }) replaces or extends the generated operation', () => {
  const secured = t.procedure.meta({
    route: {
      spec: (op) => ({ ...op, security: [{ apiKey: [] }] }),
    },
  });
  const specRouter = {
    me: secured
      .meta({
        route: { path: '/me', spec: (op) => ({ ...op, 'x-internal': true }) },
      })
      .query(() => 'me'),
    raw: t.procedure
      .meta({
        route: {
          method: 'POST',
          path: '/raw',
          spec: {
            operationId: 'upload',
            responses: { 204: { description: 'Done' } },
          },
        },
      })
      .mutation(() => undefined),
    extended: t.procedure
      .meta({ route: { spec: { summary: 'Base' } } })
      .meta({ route: { spec: (op) => ({ ...op, deprecated: true }) } })
      .meta({ route: { path: '/extended' } })
      .query(() => 'extended'),
  } satisfies AnyRouter;
  const doc = experimental_generateOpenApi(specRouter, {
    info: { title: 'x', version: '1' },
  });
  expect(doc.paths['/api/me']!['get']).toMatchObject({
    operationId: 'me',
    security: [{ apiKey: [] }],
    'x-internal': true,
    responses: { 200: { description: 'OK' } },
  });
  expect(doc.paths['/api/raw']!['post']).toEqual({
    operationId: 'upload',
    responses: { 204: { description: 'Done' } },
  });
  expect(doc.paths['/api/extended']!['get']).toEqual({
    summary: 'Base',
    deprecated: true,
  });
  expect(experimental_toContract(specRouter).procedures['me']?.route).toEqual({
    path: '/me',
  });

  const rpc = experimental_generateOpenApi(specRouter, {
    info: { title: 'x', version: '1' },
    target: 'rpc',
  });
  expect(JSON.stringify(rpc)).not.toContain('apiKey');
});

test('security schemes, document-level security and tags', () => {
  const doc = experimental_generateOpenApi(
    {
      me: t.procedure.query(() => 'me'),
      health: t.procedure
        .meta({ route: { spec: (op) => ({ ...op, security: [] }) } })
        .query(() => 'ok'),
    },
    {
      info: { title: 'x', version: '1' },
      components: {
        securitySchemes: {
          bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          key: { type: 'apiKey', in: 'header', name: 'x-api-key' },
        },
      },
      security: [{ bearer: [] }, { key: [] }],
      tags: [{ name: 'posts', description: 'Blog posts' }],
    },
  );
  expect(doc.components.securitySchemes).toEqual({
    bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    key: { type: 'apiKey', in: 'header', name: 'x-api-key' },
  });
  expect(doc.components.schemas).toHaveProperty('TrpcUntypedError');
  expect(doc.security).toEqual([{ bearer: [] }, { key: [] }]);
  expect(doc.tags).toEqual([{ name: 'posts', description: 'Blog posts' }]);
  expect(doc.paths['/api/health']!['get']?.security).toEqual([]);
});

test('a body with a file is documented as multipart/form-data, and served', async () => {
  const router = t.router({
    upload: t.procedure
      .meta({ route: { method: 'POST', path: '/files' } })
      .input(z.object({ name: z.string(), file: z.file() }))
      .mutation(() => 'ok'),
    gallery: t.procedure
      .meta({ route: { method: 'POST', path: '/galleries/{id}' } })
      .input(
        z.object({
          id: z.string(),
          photos: z.array(z.instanceof(Blob)).optional(),
        }),
      )
      .mutation((opts) => ({
        id: opts.input.id,
        sizes: opts.input.photos?.map((p) => p.size),
      })),
    avatar: t.procedure
      .meta({
        route: {
          method: 'PUT',
          path: '/avatar',
          inputStructure: 'detailed',
        },
      })
      .input(z.object({ body: z.object({ image: z.instanceof(File) }) }))
      .mutation(() => 'ok'),
    post: t.procedure
      .meta({ route: { method: 'POST', path: '/posts' } })
      .input(z.object({ title: z.string() }))
      .mutation(() => 'ok'),
  });
  const doc = experimental_generateOpenApi(router, {
    info: { title: 'x', version: '1' },
  });
  const body = (path: string, method: string) =>
    (
      doc.paths[path]![method]!.requestBody as {
        content: Record<string, { schema: Record<string, unknown> }>;
      }
    ).content;
  const binary = { type: 'string', format: 'binary' };

  const upload = body('/api/files', 'post');
  expect(Object.keys(upload)).toEqual(['multipart/form-data']);
  expect(upload['multipart/form-data']!.schema).toMatchObject({
    properties: { name: { type: 'string' }, file: binary },
  });
  expect(
    body('/api/galleries/{id}', 'post')['multipart/form-data']!.schema,
  ).toMatchObject({ properties: { photos: { items: binary } } });
  expect(body('/api/avatar', 'put')['multipart/form-data']!.schema).toEqual({
    type: 'object',
    properties: { image: binary },
    required: ['image'],
  });
  expect(Object.keys(body('/api/posts', 'post'))).toEqual(['application/json']);

  const handler = experimental_createOpenApiHandler({
    router,
    createContext: () => ({ user: null }),
  });
  const send = async (photos: string[]) => {
    const form = new FormData();
    for (const photo of photos) form.append('photos', new Blob([photo]));
    const res = await handler.fetch(
      new Request('http://localhost/api/galleries/g1', {
        method: 'POST',
        body: form,
      }),
    );
    return res.json();
  };
  expect(await send(['ab', 'cde'])).toEqual({ id: 'g1', sizes: [2, 3] });
  expect(await send(['ab'])).toEqual({ id: 'g1', sizes: [2] });
  await handler.dispose();
});

test('the default error leaves out documented codes, so generated clients narrow on defined and code', () => {
  const procedures = {
    byId: t.procedure
      .meta({ route: { path: '/posts/{id}' } })
      .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
      .input(z.object({ id: z.string() }))
      .query(() => 'post'),
  } satisfies AnyRouter;
  const rest = experimental_generateOpenApi(procedures, {
    info: { title: 'x', version: '1' },
  });
  const schema = (doc: typeof rest, path: string) =>
    (
      doc.paths[path]!['get']!.responses['default'] as {
        content: Record<string, { schema: Record<string, unknown> }>;
      }
    ).content['application/json']!.schema;
  const untyped = { $ref: '#/components/schemas/TrpcUntypedError' };
  const fallback = schema(rest, '/api/posts/{id}');
  expect(fallback).toEqual({
    anyOf: [
      untyped,
      {
        type: 'object',
        properties: {
          defined: { const: true },
          code: { enum: expect.any(Array) },
          tag: { type: 'string' },
          message: { type: 'string' },
          data: {},
        },
        required: ['defined', 'code', 'message'],
      },
    ],
  });
  const codes = (
    fallback['anyOf'] as Record<string, Record<string, { enum: string[] }>>[]
  )[1]!['properties']!['code']!.enum;
  expect(codes).toContain('UNAUTHORIZED');
  expect(codes).toContain('INTERNAL_SERVER_ERROR');
  expect(codes).not.toContain('NOT_FOUND');
  expect(codes).not.toContain('BAD_REQUEST');
  expect(codes).not.toContain('NETWORK_ERROR');
  expect(rest.components.schemas['TrpcUntypedError']).toEqual({
    type: 'object',
    properties: {
      defined: { const: false },
      code: { type: 'string' },
      tag: { type: 'string' },
      message: { type: 'string' },
      data: {},
    },
    required: ['defined', 'code', 'message'],
  });

  const rpc = experimental_generateOpenApi(procedures, {
    info: { title: 'x', version: '1' },
    target: 'rpc',
  });
  expect(schema(rpc, '/trpc/byId')).toEqual({
    type: 'object',
    properties: {
      json: { type: 'object', properties: { error: fallback } },
    },
    required: ['json'],
  });
});

test('zod dates are documented as the date-time strings JSON sends', () => {
  const doc = experimental_generateOpenApi(
    {
      events: t.procedure
        .meta({ route: { method: 'POST', path: '/events' } })
        .input(z.object({ since: z.coerce.date(), until: z.date().optional() }))
        .output(z.object({ at: z.date(), ended: z.date().nullable() }))
        .mutation(() => ({ at: new Date(0), ended: null })),
    },
    { info: { title: 'x', version: '1' } },
  );
  const op = doc.paths['/api/events']!['post']!;
  const dateTime = { type: 'string', format: 'date-time' };
  expect(
    (op.responses['200'] as { content: Record<string, { schema: unknown }> })
      .content['application/json']!.schema,
  ).toMatchObject({
    properties: {
      at: dateTime,
      ended: { anyOf: [dateTime, { type: 'null' }] },
    },
  });
  expect(
    (op.requestBody as { content: Record<string, { schema: unknown }> })
      .content['application/json']!.schema,
  ).toMatchObject({
    // A plain `z.date()` input rejects the string a client sends.
    properties: { since: dateTime, until: {} },
  });
});
