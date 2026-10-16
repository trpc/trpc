import { Effect, Layer, Schema } from 'effect';
import { Persistence } from 'effect/persistence';
import { createTrpcClient, durableLink, httpLink, safe } from 'trpcdev/client';
import { durable } from 'trpcdev/middleware';
import { createOpenApiHandler } from 'trpcdev/openapi';
import { createFetchHandler, initTrpc, TrpcError } from 'trpcdev/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { createTestServer } from './fixtures/server.ts';

const t = initTrpc();
class OutOfStock extends TrpcError.Tagged('OUT_OF_STOCK', {
  status: 409,
  data: Schema.Struct({ sku: Schema.String }),
}) {}

const makeRouter = () => {
  const runs = { order: 0, fail: 0, slow: 0 };
  const router = {
    order: t.procedure
      .input(Schema.Struct({ sku: Schema.String }))
      .use(durable())
      .mutation(({ input }) => {
        runs.order++;
        if (input.sku === 'gone') return new OutOfStock({ sku: input.sku });
        return { id: runs.order, sku: input.sku, at: new Date(0) };
      }),
    fail: t.procedure.use(durable()).mutation(() => {
      runs.fail++;
      throw new Error('boom');
    }),
    slow: t.procedure.use(durable()).mutation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return ++runs.slow;
    }),
  };
  return { router, runs };
};

const post = (
  handler: { fetch: (r: Request) => Promise<Response> },
  path: string,
  input: unknown,
  callId?: string,
  signal?: AbortSignal,
) =>
  handler.fetch(
    new Request(`http://localhost/trpc/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(callId ? { 'trpc-call-id': callId } : {}),
      },
      body: JSON.stringify({ json: input }),
      signal,
    }),
  );

test('a call id runs the mutation once; calling again returns the kept result', async () => {
  const { router, runs } = makeRouter();
  const handler = createFetchHandler({
    router,
    layer: Persistence.layerBackingMemory,
  });
  const first = await (await post(handler, 'order', { sku: 'a' }, 'c1')).json();
  const again = await (await post(handler, 'order', { sku: 'a' }, 'c1')).json();
  expect(again).toEqual(first);
  expect(runs.order).toBe(1);

  await post(handler, 'order', { sku: 'a' }, 'c2');
  await post(handler, 'order', { sku: 'a' });
  await post(handler, 'order', { sku: 'a' });
  expect(runs.order).toBe(4);
  await handler.dispose();
});

test('the same id with another input is a CONFLICT; a bad id is a BAD_REQUEST', async () => {
  const { router } = makeRouter();
  const handler = createFetchHandler({
    router,
    layer: Persistence.layerBackingMemory,
  });
  await post(handler, 'order', { sku: 'a' }, 'c1');
  const conflict = await post(handler, 'order', { sku: 'b' }, 'c1');
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({
    json: { error: { code: 'CONFLICT' } },
  });
  expect((await post(handler, 'order', { sku: 'a' }, 'bad id\n')).status).toBe(
    400,
  );
  await handler.dispose();
});

test('typed errors are kept, unexpected ones run again', async () => {
  const { router, runs } = makeRouter();
  const handler = createFetchHandler({
    router,
    layer: Persistence.layerBackingMemory,
  });
  for (let i = 0; i < 2; i++) {
    const res = await post(handler, 'order', { sku: 'gone' }, 'c1');
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      json: {
        error: { code: 'OUT_OF_STOCK', data: { sku: 'gone' }, defined: true },
      },
    });
  }
  expect(runs.order).toBe(1);

  expect((await post(handler, 'fail', undefined, 'f1')).status).toBe(500);
  expect((await post(handler, 'fail', undefined, 'f1')).status).toBe(500);
  expect(runs.fail).toBe(2);
  await handler.dispose();
});

test('a dropped request keeps running; the retry joins it', async () => {
  const { router, runs } = makeRouter();
  const handler = createFetchHandler({
    router,
    layer: Persistence.layerBackingMemory,
  });
  const controller = new AbortController();
  const dropped = post(handler, 'slow', undefined, 's1', controller.signal);
  await new Promise((r) => setTimeout(r, 10));
  controller.abort();
  await dropped.catch(() => {});

  const retried = await post(handler, 'slow', undefined, 's1');
  expect(await retried.json()).toEqual({ json: 1 });
  expect(runs.slow).toBe(1);
  await handler.dispose();
});

test('instances sharing a store wait for the one running the call', async () => {
  const { router, runs } = makeRouter();
  const shared = await Effect.runPromise(
    Effect.service(Persistence.BackingPersistence).pipe(
      Effect.provide(Persistence.layerBackingMemory),
    ),
  );
  const instance = () =>
    createFetchHandler({
      router,
      layer: Layer.succeed(Persistence.BackingPersistence, {
        make: (id) => shared.make(id),
      }),
    });
  const [a, b] = [instance(), instance()];
  const first = post(a, 'slow', undefined, 'x1');
  await new Promise((r) => setTimeout(r, 10));
  const second = post(b, 'slow', undefined, 'x1');
  expect(await (await second).json()).toEqual({ json: 1 });
  expect(await (await first).json()).toEqual({ json: 1 });
  expect(runs.slow).toBe(1);
  await a.dispose();
  await b.dispose();
});

test('durableLink retries a lost response with the same id', async () => {
  const { router, runs } = makeRouter();
  await using http = await createTestServer({
    router,
    layer: Persistence.layerBackingMemory,
  });
  const sent: Array<{ callId: string | null; batch: string | null }> = [];
  let drop = true;
  const client = createTrpcClient({
    router,
    links: [
      durableLink({ delayMs: () => 0 }),
      httpLink({
        url: http.url,
        batch: true,
        fetch: async (url, init) => {
          const headers = new Headers(init?.headers);
          sent.push({
            callId: headers.get('trpc-call-id'),
            batch: headers.get('trpc-batch'),
          });
          const res = await fetch(url, init);
          if (drop) {
            drop = false;
            throw new TypeError('fetch failed');
          }
          return res;
        },
      }),
    ],
  });
  const order = await client.order.mutate({ sku: 'a' });
  expect(order).toEqual({ id: 1, sku: 'a', at: new Date(0) });
  expect(runs.order).toBe(1);
  expect(sent).toHaveLength(2);
  expect(sent[0]!.callId).toMatch(/^[\w-]{36}$/);
  expect(sent[1]!.callId).toBe(sent[0]!.callId);
  expect(sent[0]!.batch).toBeNull();

  await client.order.mutate({ sku: 'b' }, { callId: 'kept' });
  await client.order.mutate({ sku: 'b' }, { callId: 'kept' });
  expect(runs.order).toBe(2);

  const [, err] = await safe(client.order.mutate({ sku: 'gone' }));
  expect(err).toMatchObject({ code: 'OUT_OF_STOCK' });
});

test('a call id is kept over REST too', async () => {
  const { router, runs } = makeRouter();
  const handler = createOpenApiHandler({
    router,
    layer: Persistence.layerBackingMemory,
  });
  const call = () =>
    handler.fetch(
      new Request('http://localhost/api/order', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'trpc-call-id': 'r1' },
        body: JSON.stringify({ sku: 'a' }),
      }),
    );
  const first = await (await call()).json();
  expect(await (await call()).json()).toEqual(first);
  expect(runs.order).toBe(1);
  await handler.dispose();
});

test('durable() requires BackingPersistence', () => {
  const { router } = makeRouter();
  expectTypeOf<
    Parameters<typeof createFetchHandler<typeof router>>[0]['layer']
  >().toEqualTypeOf<Layer.Layer<Persistence.BackingPersistence, any, never>>();
  // @ts-expect-error -- BackingPersistence is required
  createFetchHandler({ router });
});
