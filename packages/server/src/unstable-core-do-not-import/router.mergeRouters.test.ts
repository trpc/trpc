import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { getUntypedClient, httpBatchStreamLink } from '@trpc/client';
import type { TRPCRouterRecord } from '../@trpc/server';
import { initTRPC } from '../@trpc/server';
import {
  createDeferred,
  makeAsyncResource,
} from '../unstable-core-do-not-import';
import type { inferClientTypes } from '../unstable-core-do-not-import';

test('mergeRouters', async () => {
  const t = initTRPC.create();

  const router1 = t.router({
    foo: t.procedure.query(() => 'foo'),
  });
  const router2 = t.router({
    bar: t.procedure.query(() => 'bar'),
  });
  const merged = t.mergeRouters(router1, router2);
  const caller = merged.createCaller({});

  await expect(caller.foo()).resolves.toBe('foo');
  await expect(caller.bar()).resolves.toBe('bar');
});

test('merge routers with spread operator', async () => {
  const t = initTRPC.create();

  const router1 = {
    foo: t.procedure.query(() => 'foo'),
  } satisfies TRPCRouterRecord;
  const router2 = {
    bar: t.procedure.query(() => 'bar'),
  } satisfies TRPCRouterRecord;

  const merged = t.router({
    ...router1,
    ...router2,
  });
  const caller = t.createCallerFactory(merged)({});

  await expect(caller.foo()).resolves.toBe('foo');
  await expect(caller.bar()).resolves.toBe('bar');
});

test('good merge: one has default formatter', async () => {
  const t1 = initTRPC.create({});

  const t2 = initTRPC.create({
    errorFormatter: (fmt) => fmt.shape,
  });

  const router1 = t1.router({
    foo: t1.procedure.query(() => 'foo'),
  });
  const router2 = t2.router({
    bar: t1.procedure.query(() => 'bar'),
  });

  const merged = t1.mergeRouters(router1, router2);
  const caller = merged.createCaller({});

  await expect(caller.foo()).resolves.toBe('foo');
  await expect(caller.bar()).resolves.toBe('bar');
});

test('good merge: one has default transformer', async () => {
  type Context = {
    foo: 'bar';
  };
  const t1 = initTRPC.context<Context>().create({});

  const t2 = initTRPC.create({
    transformer: {
      deserialize: (v) => v,
      serialize: (v) => v,
    },
  });

  const router1 = t1.router({
    foo: t1.procedure.query(() => 'foo'),
  });
  const router2 = t2.router({
    bar: t1.procedure.query(() => 'bar'),
  });

  const merged = t1.mergeRouters(router1, router2);
  const caller = merged.createCaller({
    foo: 'bar',
  });

  await expect(caller.foo()).resolves.toBe('foo');
  await expect(caller.bar()).resolves.toBe('bar');

  expectTypeOf<inferClientTypes<typeof router1>>().toEqualTypeOf<
    inferClientTypes<typeof merged>
  >();
});
test('bad merge: error formatter', async () => {
  const t1 = initTRPC.create({
    errorFormatter: (fmt) => fmt.shape,
  });

  const t2 = initTRPC.create({
    errorFormatter: (fmt) => fmt.shape,
  });

  const router1 = t1.router({
    foo: t1.procedure.query(() => 'foo'),
  });
  const router2 = t2.router({
    bar: t1.procedure.query(() => 'bar'),
  });

  expect(() =>
    t1.mergeRouters(router1, router2),
  ).toThrowErrorMatchingInlineSnapshot(
    `[Error: You seem to have several error formatters]`,
  );
});

test('bad merge: transformer', async () => {
  const t1 = initTRPC.create({
    transformer: {
      deserialize: (v) => v,
      serialize: (v) => v,
    },
  });

  const t2 = initTRPC.create({
    transformer: {
      deserialize: (v) => v,
      serialize: (v) => v,
    },
  });

  const router1 = t1.router({
    foo: t1.procedure.query(() => 'foo'),
  });
  const router2 = t2.router({
    bar: t1.procedure.query(() => 'bar'),
  });

  expect(() =>
    t1.mergeRouters(router1, router2),
  ).toThrowErrorMatchingInlineSnapshot(
    `[Error: You seem to have several transformers]`,
  );
});

test('mergeRouters keeps the root options of the first router', () => {
  const t = initTRPC.meta<{ tag: string }>().create({
    defaultMeta: { tag: 'default' },
    sse: { ping: { enabled: true, intervalMs: 5 } },
    jsonl: { contentType: 'application/x-ndjson', pingMs: 5 },
  });
  const first = t.router({ a: t.procedure.query(() => 'a') });
  const other = initTRPC.create().router({});

  for (const merged of [t.mergeRouters(first), t.mergeRouters(first, other)]) {
    // Every option without a merge rule must come through, including ones
    // added to `RootConfig` later.
    expect(merged._def._config).toEqual(first._def._config);
  }
});

test.each([
  'direct',
  'nested',
  'merged one',
  'merged two',
  'different roots',
] as const)(
  '%s preserves JSONL headers and heartbeats',
  async (composition) => {
    const t = initTRPC.create({
      jsonl: { contentType: 'application/x-ndjson', pingMs: 5 },
    });
    const value = { id: 17, text: 'consumer-value' };
    const result = createDeferred<typeof value>();
    const first = t.router({ value: t.procedure.query(() => result.promise) });
    const other = initTRPC.create({
      jsonl: { contentType: 'application/json', pingMs: 60_000 },
    });
    const routers = {
      direct: first,
      nested: t.router({ nested: first }),
      'merged one': t.mergeRouters(first),
      'merged two': t.mergeRouters(first, t.router({})),
      'different roots': t.mergeRouters(first, other.router({})),
    };
    const router = routers[composition];
    let contentType: string | null = null;
    let pingBytes = 0;
    await using ctx = testServerAndClientResource(router, {
      client: (opts) => ({
        links: [
          httpBatchStreamLink({
            url: opts.httpUrl,
            async fetch(url, init) {
              const response = await fetch(url, init);
              contentType = response.headers.get('content-type');
              const body = response.body?.pipeThrough(
                new TransformStream({
                  transform(chunk: Uint8Array, controller) {
                    // JSONL heartbeats are spaces; this payload contains none.
                    pingBytes += chunk.filter((byte) => byte === 32).length;
                    controller.enqueue(chunk);
                  },
                }),
              );
              return new Response(body, response);
            },
          }),
        ],
      }),
    });
    const query = getUntypedClient(ctx.client).query(
      composition === 'nested' ? 'nested.value' : 'value',
    );
    await using _release = makeAsyncResource({}, async () => {
      result.resolve(value);
      await query;
    });

    await vi.waitFor(() => {
      expect(contentType).toBe('application/x-ndjson');
      expect(pingBytes).toBeGreaterThan(0);
    });
    result.resolve(value);
    await expect(query).resolves.toEqual(value);
  },
);

test.each([false, true])(
  'mergeRouters keeps JSONL defaults when first router is unconfigured (%s)',
  async (configuredSecond) => {
    const t = initTRPC.create();
    const value = { id: 17, text: 'consumer-value' };
    const first = t.router({ value: t.procedure.query(() => value) });
    const other = initTRPC.create({
      jsonl: { contentType: 'application/x-ndjson', pingMs: 5 },
    });
    const router = configuredSecond
      ? t.mergeRouters(first, other.router({}))
      : t.mergeRouters(first);
    let contentType: string | null = null;
    await using ctx = testServerAndClientResource(router, {
      client: (opts) => ({
        links: [
          httpBatchStreamLink({
            url: opts.httpUrl,
            async fetch(url, init) {
              const response = await fetch(url, init);
              contentType = response.headers.get('content-type');
              return response;
            },
          }),
        ],
      }),
    });

    await expect(ctx.client.value.query()).resolves.toEqual(value);
    expect(contentType).toBe('application/json');
  },
);
