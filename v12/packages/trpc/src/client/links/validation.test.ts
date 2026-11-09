import { Effect, Predicate, Schema } from 'effect';
import {
  createSafeClient,
  createTrpcClient,
  httpLink,
  matchError,
  safe,
  experimental_validationLink,
  TrpcError,
} from '@trpc12/trpc/client';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
import {
  type AnyContractRouter,
  experimental_contract,
  experimental_toContract,
} from '@trpc12/trpc/contract';
import {
  experimental_createOpenApiHandler,
  experimental_openapi,
  experimental_openApiLink,
} from '@trpc12/trpc/openapi';
import { createEffectClient } from '@trpc12/trpc/effect';
import { createUntypedClient } from '@trpc12/trpc/extend';
import {
  type AnyRouter,
  error,
  type inferRouterOutputs,
  initTrpc,
  stream,
  tracked,
} from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from '../../fixtures/server.ts';

const Post = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  at: Schema.Date,
});

const c = experimental_contract.create().concat(experimental_openapi());
const appContract = {
  post: {
    byId: c
      .input(z.object({ id: z.string().min(1) }))
      .output(Post)
      .meta({ route: { method: 'GET', path: '/posts/{id}' } })
      .query(),
    feed: c.output(Post).subscription({ tracked: true }),
  },
} satisfies AnyContractRouter;

const t = initTrpc().concat(experimental_openapi());
const at = new Date('2026-10-16T00:00:00.000Z');
const impl = t.implement(appContract);
const router = impl.router({
  post: {
    byId: impl.post.byId.query((opts) => ({
      id: opts.input.id,
      title: 'Hello',
      at,
    })),
    feed: impl.post.feed.subscription(async function* () {
      yield tracked('1', { id: '1', title: 'One', at });
    }),
  },
});

test('invalid inputs fail on the client with the server error shape, before any request', async () => {
  await using http = await createTestServer({ router });
  const client = createTrpcClient({
    router: appContract,
    links: [
      experimental_validationLink({ contract: appContract, output: 'json' }),
      httpLink({ url: http.url }),
    ],
  });
  const [, err] = await safe(client.post.byId.query({ id: '' }));
  expect(err).toMatchObject({ code: 'BAD_REQUEST', defined: true });
  if (err?.defined && err.code === 'BAD_REQUEST') {
    expect(err.data.issues[0]?.path).toEqual(['id']);
  }
  expect(http.requests).toHaveLength(0);

  const post = await client.post.byId.query({ id: '1' });
  expect(post).toEqual({ id: '1', title: 'Hello', at });
  expect(http.requests).toHaveLength(1);

  const events = [];
  for await (const event of client.post.feed.subscribe()) events.push(event);
  expect(events).toEqual([{ id: '1', data: { id: '1', title: 'One', at } }]);
});

test('results that drift from the contract fail with BAD_RESPONSE', async () => {
  await using http = await createTestServer({
    router: t.router({
      post: {
        byId: t.procedure
          .input(z.object({ id: z.string() }))
          .query((opts) => ({ id: Number(opts.input.id), title: 'Hello', at })),
        feed: t.procedure.subscription(async function* () {
          yield tracked('1', { id: '1', title: 2, at });
        }),
      },
    }),
  });
  const client = createTrpcClient({
    router: appContract,
    links: [
      experimental_validationLink({ contract: appContract }),
      httpLink({ url: http.url }),
    ],
  });
  const [, err] = await safe(client.post.byId.query({ id: '1' }));
  if (!err) throw new Error('expected an error');
  expect(err).toMatchObject({ code: 'BAD_RESPONSE', defined: false });
  expect(err.message).toContain('Response validation failed');
  expect(err.data).toBeUndefined();
  expect((err.cause as { issues: unknown[] }).issues).toContainEqual(
    expect.objectContaining({ path: ['id'] }),
  );

  await expect(async () => {
    for await (const _ of client.post.feed.subscribe()) void _;
  }).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
});

test("output: 'json' decodes experimental_openApiLink's plain JSON into the schema's types", async () => {
  const openapi = experimental_createOpenApiHandler({ router });
  const json = experimental_toContract(appContract);
  const fetchVia = (input: RequestInfo | URL, init?: RequestInit) =>
    openapi.fetch(new Request(input, init));

  const plain = createTrpcClient({
    router: json,
    links: [
      experimental_openApiLink({
        url: 'http://localhost',
        contract: json,
        fetch: fetchVia,
      }),
    ],
  });
  const raw = await plain.post.byId.query({ id: '1' });
  expectTypeOf(raw.at).toEqualTypeOf<string>();
  expect(raw.at).toBe(at.toISOString());

  const decoded = createTrpcClient({
    router: json,
    links: [
      experimental_validationLink({ contract: appContract, output: 'json' }),
      experimental_openApiLink({
        url: 'http://localhost',
        contract: json,
        fetch: fetchVia,
      }),
    ],
  });
  const post = await decoded.post.byId.query({ id: '1' });
  expectTypeOf(post.at).toEqualTypeOf<Date>();
  expect(post.at).toBeInstanceOf(Date);
  expect(post.at.getTime()).toBe(at.getTime());
  await openapi.dispose();
});

class PostGone extends TrpcError.Tagged('PostGone', {
  code: 'POST_GONE',
  status: 410,
  data: Schema.Struct({ id: Schema.String, deletedAt: Schema.Date }),
}) {}
const gone = {
  post: {
    byId: c
      .input(z.object({ id: z.string() }))
      .output(Post)
      .errors({
        POST_GONE: PostGone,
        NOT_FOUND: { data: Schema.Struct({ id: Schema.String }) },
      })
      .query(),
  },
} satisfies AnyContractRouter;

test("output: 'json' decodes declared errors' data with their schemas, and types it so", async () => {
  const goneImpl = t.implement(gone);
  const goneRouter = goneImpl.router({
    post: {
      byId: goneImpl.post.byId.query(
        (opts) => new PostGone({ id: opts.input.id, deletedAt: at }),
      ),
    },
  });

  await using http = await createTestServer({ router: goneRouter });
  const client = createTrpcClient({
    router: gone,
    links: [
      experimental_validationLink({ contract: gone, output: 'json' }),
      httpLink({ url: http.url }),
    ],
  });
  const [, err] = await safe(client.post.byId.query({ id: '1' }));
  if (!err) throw new Error('expected an error');
  expect(err).toMatchObject({ code: 'POST_GONE', defined: true });
  expect(err).toSatisfy(Predicate.isTagged('PostGone'));
  expect(err).not.toBeInstanceOf(PostGone);
  const deletedAt = matchError(err, {
    NETWORK_ERROR: () => undefined,
    BAD_RESPONSE: () => undefined,
    BAD_REQUEST: () => undefined,
    NOT_FOUND: () => undefined,
    POST_GONE: (e) => e.data.deletedAt,
    unexpected: () => undefined,
  });
  expect(deletedAt).toBeInstanceOf(Date);
  expect(deletedAt).toEqual(at);
  expectTypeOf(deletedAt).toEqualTypeOf<Date | undefined>();

  const [, safeErr] = await createSafeClient(client).post.byId.query({
    id: '1',
  });
  if (safeErr?.code !== 'POST_GONE') throw safeErr;
  expect(safeErr.data.deletedAt).toEqual(at);
  expectTypeOf(safeErr.data.deletedAt).toEqualTypeOf<Date>();

  const plain = createTrpcClient({
    router: gone,
    links: [httpLink({ url: http.url })],
  });
  const [, plainErr] = await safe(plain.post.byId.query({ id: '1' }));
  if (plainErr?.code !== 'POST_GONE') throw new Error('expected POST_GONE');
  expect(plainErr.data.deletedAt).toBe(at.toISOString());
  expectTypeOf(plainErr.data.deletedAt).toEqualTypeOf<string>();

  const effectClient = createEffectClient({
    router: gone,
    links: [
      experimental_validationLink({ contract: gone, output: 'json' }),
      httpLink({ url: http.url }),
    ],
  });
  const failed = await Effect.runPromise(
    Effect.flip(effectClient.post.byId.query({ id: '1' })),
  );
  if (failed.code !== 'POST_GONE') throw failed;
  expect(failed.data.deletedAt).toEqual(at);
  expectTypeOf(failed.data.deletedAt).toEqualTypeOf<Date>();

  await using progressiveJson = await createTestServer({
    router: goneRouter,
    transformer: experimental_createProgressiveJson(),
  });
  const kept = createTrpcClient({
    router: gone,
    links: [
      experimental_validationLink({ contract: gone }),
      httpLink({
        url: progressiveJson.url,
        transformer: experimental_createProgressiveJson(),
      }),
    ],
  });
  const [, keptErr] = await safe(kept.post.byId.query({ id: '1' }));
  if (keptErr?.code !== 'POST_GONE') throw new Error('expected POST_GONE');
  expect(keptErr.data.deletedAt).toEqual(at);
  expectTypeOf(keptErr.data.deletedAt).toEqualTypeOf<Date>();
});

test("output: 'json' types the data of errors it has no schema for in its JSON form, as it arrives", async () => {
  const p = initTrpc();
  const appRouter = p.router({
    returned: p.procedure
      .output(Post)
      .query(() => error({ code: 'EXPIRED', data: { at } })),
    declared: p.procedure
      .output(Post)
      .errors({ POST_GONE: PostGone })
      .query(() => new PostGone({ id: '1', deletedAt: at })),
  });
  await using http = await createTestServer({ router: appRouter });
  const links = [
    experimental_validationLink({ contract: appRouter, output: 'json' }),
    httpLink({ url: http.url }),
  ] as const;
  const client = createTrpcClient({ router: appRouter, links: [...links] });

  const [, returned] = await safe(client.returned.query());
  if (returned?.code !== 'EXPIRED') throw new Error('expected EXPIRED');
  expect(returned.data.at).toBe(at.toISOString());
  expectTypeOf(returned.data.at).toEqualTypeOf<string>();
  const [, declared] = await safe(client.declared.query());
  if (declared?.code !== 'POST_GONE') throw new Error('expected POST_GONE');
  expect(declared.data.deletedAt).toEqual(at);
  expectTypeOf(declared.data.deletedAt).toEqualTypeOf<Date>();

  const effectClient = createEffectClient({
    router: appRouter,
    links: [...links],
  });
  const failed = await Effect.runPromise(
    Effect.flip(effectClient.returned.query()),
  );
  if (failed.code !== 'EXPIRED') throw failed;
  expect(failed.data.at).toBe(at.toISOString());
  expectTypeOf(failed.data.at).toEqualTypeOf<string>();
});

test("a declared error whose data fails its schema arrives undeclared, as oRPC's response validation does, not as BAD_RESPONSE", async () => {
  const p = initTrpc();
  await using http = await createTestServer({
    router: p.router({
      post: {
        byId: p.procedure.input(z.object({ id: z.string() })).query((opts) =>
          opts.input.id === 'gone'
            ? new TrpcError({
                code: 'POST_GONE',
                tag: 'PostGone',
                data: { id: 'gone', deletedAt: 'not a date' },
                defined: true,
              })
            : error({ code: 'NOT_FOUND', data: { id: 404 } }),
        ),
      },
    }),
  });
  const client = createTrpcClient({
    router: gone,
    links: [
      experimental_validationLink({ contract: gone, output: 'json' }),
      httpLink({ url: http.url }),
    ],
  });

  const [, custom] = await safe(client.post.byId.query({ id: 'gone' }));
  expect(custom).toBeInstanceOf(TrpcError);
  expect(custom).toMatchObject({
    code: 'POST_GONE',
    defined: false,
    data: { id: 'gone', deletedAt: 'not a date' },
  });
  expect(custom).toSatisfy(Predicate.isTagged('POST_GONE'));
  if (!custom) throw new Error('expected an error');
  expect(
    matchError(custom, {
      NETWORK_ERROR: () => 'offline',
      BAD_RESPONSE: () => 'bad response',
      BAD_REQUEST: () => 'bad request',
      NOT_FOUND: () => 'not found',
      POST_GONE: () => 'gone',
      unexpected: (e) => `unexpected ${e.code}`,
    }),
  ).toBe('unexpected POST_GONE');

  const [, builtin] = await safe(client.post.byId.query({ id: '1' }));
  if (!builtin) throw new Error('expected an error');
  expect(builtin).toMatchObject({ code: 'NOT_FOUND', defined: false });
  expect(builtin.data).toBeUndefined();
  expect((builtin.cause as { data: unknown }).data).toEqual({ id: 404 });
});

test('undeclared errors pass through untouched', async () => {
  const p = initTrpc();
  const thrown = new TrpcError({
    code: 'LEGACY',
    data: { at: 'not a date' },
  });
  await using http = await createTestServer({
    router: p.router({
      post: {
        byId: p.procedure.input(z.object({ id: z.string() })).query(() => {
          throw thrown;
        }),
      },
    }),
  });
  const clientOf = (validate: boolean) =>
    createTrpcClient({
      router: gone,
      links: validate
        ? [
            experimental_validationLink({ contract: gone, output: 'json' }),
            httpLink({ url: http.url }),
          ]
        : [httpLink({ url: http.url })],
    });
  const [, through] = await safe(clientOf(true).post.byId.query({ id: '1' }));
  const [, direct] = await safe(clientOf(false).post.byId.query({ id: '1' }));
  expect(through).toMatchObject({
    code: 'LEGACY',
    defined: false,
    data: { at: 'not a date' },
  });
  expect(through).toEqual(direct);
  expect(Object.getPrototypeOf(through)).toBe(Object.getPrototypeOf(direct));
});

test("output: 'json' types a streamed output's items in their JSON form, as they arrive, and subscription events decoded", async () => {
  const streams = {
    post: {
      list: c.output(stream(Post)).query(),
      live: c.output(stream(Post)).subscription(),
    },
  } satisfies AnyContractRouter;
  const streamsImpl = t.implement(streams);
  const streamsRouter = streamsImpl.router({
    post: {
      list: streamsImpl.post.list.query(async function* () {
        yield { id: '1', title: 'One', at };
      }),
      live: streamsImpl.post.live.subscription(async function* () {
        yield { id: '1', title: 'One', at };
      }),
    },
  });
  await using http = await createTestServer({ router: streamsRouter });
  const links = [
    experimental_validationLink({ contract: streams, output: 'json' }),
    httpLink({ url: http.url }),
  ] as const;
  const client = createTrpcClient({ router: streams, links: [...links] });

  const items = [];
  for await (const item of await client.post.list.query()) {
    expectTypeOf(item.at).toEqualTypeOf<string>();
    items.push(item);
  }
  expect(items).toEqual([{ id: '1', title: 'One', at: at.toISOString() }]);
  const plain = createTrpcClient({
    router: streams,
    links: [httpLink({ url: http.url })],
  });
  expectTypeOf<
    inferRouterOutputs<typeof client>['post']['list']
  >().toEqualTypeOf<inferRouterOutputs<typeof plain>['post']['list']>();

  const effectClient = createEffectClient({
    router: streams,
    links: [...links],
  });
  const iterable = await Effect.runPromise(effectClient.post.list.query());
  for await (const item of iterable) {
    expect(item.at).toBe(at.toISOString());
    expectTypeOf(item.at).toEqualTypeOf<string>();
  }

  for await (const event of client.post.live.subscribe()) {
    expect(event.at).toBeInstanceOf(Date);
    expectTypeOf(event.at).toEqualTypeOf<Date>();
  }
});

test("output: 'json' types as the schemas' types only the results it decodes", async () => {
  const p = initTrpc();
  const post = () => ({ id: '1', title: 'One', at });
  const appRouter = p.router({
    decoded: p.procedure.output(Post).query(post),
    coerced: p.procedure
      .output(z.object({ at: z.coerce.date() }))
      .mutation(() => ({ at })),
    inferred: p.procedure.query(post),
    trusted: p.procedure.output(Post, { validate: false }).query(post),
    events: p.procedure.subscription(async function* () {
      yield post();
    }),
    decodedEvents: p.procedure.output(Post).subscription(async function* () {
      yield post();
    }),
    outside: { decoded: p.procedure.output(Post).query(post) },
  });
  const { outside: _, ...linkContract } = appRouter;
  await using http = await createTestServer({ router: appRouter });
  const links = [
    experimental_validationLink({ contract: linkContract, output: 'json' }),
    httpLink({ url: http.url }),
  ] as const;
  const client = createTrpcClient({ router: appRouter, links: [...links] });

  const decoded = await client.decoded.query();
  expect(decoded.at).toBeInstanceOf(Date);
  expectTypeOf(decoded.at).toEqualTypeOf<Date>();
  const coerced = await client.coerced.mutate();
  expect(coerced.at).toBeInstanceOf(Date);
  expectTypeOf(coerced.at).toEqualTypeOf<Date>();
  const inferred = await client.inferred.query();
  expect(inferred.at).toBe(at.toISOString());
  expectTypeOf(inferred.at).toEqualTypeOf<string>();
  const trusted = await client.trusted.query();
  expect(trusted.at).toBe(at.toISOString());
  expectTypeOf(trusted.at).toEqualTypeOf<string>();
  const outside = await client.outside.decoded.query();
  expect(outside.at).toBe(at.toISOString());
  expectTypeOf(outside.at).toEqualTypeOf<string>();
  for await (const event of client.events.subscribe()) {
    expect(event.at).toBe(at.toISOString());
    expectTypeOf(event.at).toEqualTypeOf<string>();
  }
  for await (const event of client.decodedEvents.subscribe()) {
    expect(event.at).toBeInstanceOf(Date);
    expectTypeOf(event.at).toEqualTypeOf<Date>();
  }

  type Outputs = inferRouterOutputs<typeof client>;
  expectTypeOf<Outputs['decoded']['at']>().toEqualTypeOf<Date>();
  expectTypeOf<Outputs['inferred']['at']>().toEqualTypeOf<string>();
  expectTypeOf<Outputs['trusted']['at']>().toEqualTypeOf<string>();
  expectTypeOf<Outputs['outside']['decoded']['at']>().toEqualTypeOf<string>();

  const effectClient = createEffectClient({
    router: appRouter,
    links: [...links],
  });
  const effectDecoded = await Effect.runPromise(effectClient.decoded.query());
  expect(effectDecoded.at).toBeInstanceOf(Date);
  expectTypeOf(effectDecoded.at).toEqualTypeOf<Date>();
  const effectTrusted = await Effect.runPromise(effectClient.trusted.query());
  expect(effectTrusted.at).toBe(at.toISOString());
  expectTypeOf(effectTrusted.at).toEqualTypeOf<string>();
  const effectOutside = await Effect.runPromise(
    effectClient.outside.decoded.query(),
  );
  expectTypeOf(effectOutside.at).toEqualTypeOf<string>();
});

test('streamed outputs, unvalidated outputs, plain events, opt-outs and paths outside the contract', async () => {
  const p = initTrpc();
  const contractOf = {
    tokens: p.procedure.output(stream(z.string())).query(async function* () {}),
    numbers: p.procedure
      .output(stream(z.number()))
      .subscription(async function* () {}),
    plain: p.procedure.output(z.number()).subscription(async function* () {}),
    trusted: p.procedure
      .output(z.object({ n: z.number() }), { validate: false })
      .query(() => ({ n: 1 })),
    strict: p.procedure
      .input(z.object({ n: z.number() }))
      .output(z.number())
      .query((opts) => opts.input.n),
    perCall: p.procedure
      .input(() => z.object({ n: z.number() }))
      .query((opts) => opts.input.n),
    nested: { leaf: p.procedure.output(z.number()).query(() => 1) },
  } satisfies AnyRouter;
  await using http = await createTestServer({
    router: p.router({
      perCall: p.procedure
        .input(z.unknown())
        .query(() => 'checked by the server'),
      tokens: p.procedure.query(async function* () {
        yield 'a';
        yield 'b';
      }),
      numbers: p.procedure.subscription(async function* () {
        yield 1;
        yield 'two';
      }),
      plain: p.procedure.subscription(async function* () {
        yield 1;
        yield 'two';
      }),
      trusted: p.procedure.query(() => ({ n: 'not a number' })),
      strict: p.procedure.input(z.unknown()).query(() => 'unchecked'),
      extra: p.procedure.query(() => 'not in the contract'),
    }),
  });
  const client = (opts: Parameters<typeof experimental_validationLink>[0]) =>
    createUntypedClient({
      links: [experimental_validationLink(opts), httpLink({ url: http.url })],
    });
  const checked = client({ contract: contractOf });
  const collect = async (path: string) => {
    const seen: unknown[] = [];
    try {
      for await (const v of checked.subscribe({ path, input: undefined })) {
        seen.push(v);
      }
    } catch (err) {
      seen.push((err as { code: string }).code);
    }
    return seen;
  };

  const tokens = (await checked.request({
    type: 'query',
    path: 'tokens',
    input: undefined,
  })) as AsyncIterable<string>;
  const read: string[] = [];
  for await (const token of tokens) read.push(token);
  expect(read).toEqual(['a', 'b']);
  expect(await collect('numbers')).toEqual([1, 'BAD_RESPONSE']);
  expect(await collect('plain')).toEqual([1, 'BAD_RESPONSE']);
  expect(
    await checked.request({ type: 'query', path: 'trusted', input: undefined }),
  ).toEqual({ n: 'not a number' });
  expect(
    await checked.request({ type: 'query', path: 'extra', input: undefined }),
  ).toBe('not in the contract');
  const [, through] = await safe(
    checked.request({ type: 'query', path: 'strict.deeper', input: undefined }),
  );
  expect(through).toMatchObject({ code: 'NOT_FOUND' });
  const [, router] = await safe(
    checked.request({ type: 'query', path: 'nested', input: undefined }),
  );
  expect(router).toMatchObject({ code: 'NOT_FOUND' });

  const before = http.requests.length;
  const [, early] = await safe(
    checked.request({ type: 'query', path: 'strict', input: { n: 'x' } }),
  );
  expect(early).toMatchObject({ code: 'BAD_REQUEST' });
  expect(http.requests).toHaveLength(before);
  expect(
    await checked.request({
      type: 'query',
      path: 'perCall',
      input: { n: 'x' },
    }),
  ).toBe('checked by the server');

  const lax = client({ contract: contractOf, input: false, output: false });
  expect(
    await lax.request({ type: 'query', path: 'strict', input: { n: 'x' } }),
  ).toBe('unchecked');
  expect(http.requests).toHaveLength(before + 2);
});
