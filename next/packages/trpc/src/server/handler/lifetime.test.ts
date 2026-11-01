import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import {
  type AnyRouter,
  createFetchHandler,
  createRouterClient,
  initTrpc,
  makeFetchHandler,
} from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';

class Pool extends Context.Service<Pool, { readonly id: number }>()('Pool') {}

const t = initTrpc();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const router = t.router({
  pool: t.procedure.query(() =>
    Effect.gen(function* () {
      return (yield* Pool).id;
    }),
  ),
  quick: t.procedure.query(async () => {
    await sleep(20);
    return 'done';
  }),
  stuck: t.procedure.query(() => Effect.never),
  rows: t.procedure.query(() => ({
    rows: (async function* () {
      yield 'a';
      await sleep(20);
      yield 'b';
    })(),
  })),
  events: t.procedure.subscription(async function* () {
    yield 1;
    await new Promise(() => {});
  }),
}) satisfies AnyRouter;

const get = (
  handler: { fetch: (r: Request) => Promise<Response> },
  path: string,
) => handler.fetch(new Request(`http://localhost/trpc/${path}`));

/** A Pool layer that records its release in `events`. */
const pool = (events: string[]) => {
  let built = 0;
  return Layer.effect(
    Pool,
    Effect.acquireRelease(
      Effect.sync(() => ({ id: ++built })),
      () => Effect.sync(() => events.push('released')),
    ),
  );
};

test("a handler reads a caller's runtime, built once with createRouterClient's, and dispose() leaves it running", async () => {
  const events: string[] = [];
  const runtime = ManagedRuntime.make(pool(events));
  const handler = createFetchHandler({ router, runtime });
  const caller = createRouterClient(router, { ctx: {}, runtime });

  expect(await (await get(handler, 'pool')).text()).toContain('1');
  expect(await caller.pool.query()).toBe(1);
  await handler.dispose();
  expect(events).toEqual([]);
  expect(await caller.pool.query()).toBe(1);
  // A request after dispose() runs untracked, on the runtime still running.
  expect(await (await get(handler, 'pool')).text()).toContain('1');

  await runtime.dispose();
  expect(events).toEqual(['released']);
});

test('layer and runtime are exclusive', () => {
  const runtime = ManagedRuntime.make(Layer.succeed(Pool, { id: 1 }));
  const both = () =>
    // @ts-expect-error -- the handler takes a layer or a runtime, not both
    createFetchHandler({
      router,
      runtime,
      layer: Layer.succeed(Pool, { id: 2 }),
    });
  // @ts-expect-error -- `pool` needs Pool, so `layer` or `runtime` is required
  const neither = () => createFetchHandler({ router });
  expect([both, neither]).toHaveLength(2);
});

test('dispose() ends event streams at once, waits for requests and streamed bodies up to the drain timeout, then interrupts what is left (503)', async () => {
  const events: string[] = [];
  const handler = createFetchHandler({
    router,
    layer: pool(events),
    websocket: { drainTimeout: '150 millis' },
  });
  const stream = await get(handler, 'events');
  const reader = stream.body!.getReader();
  await reader.read();
  const quick = get(handler, 'quick');
  const stuck = get(handler, 'stuck');
  const rows = await get(handler, 'rows');
  const rowsText = rows.text();

  const started = Date.now();
  const disposed = handler.dispose();
  await expect(
    (async () => {
      while (!(await reader.read()).done);
    })(),
  ).rejects.toBeDefined();
  expect(await (await quick).text()).toContain('done');
  expect(await rowsText).toContain('b');
  expect((await stuck).status).toBe(503);
  await disposed;
  expect(Date.now() - started).toBeGreaterThanOrEqual(140);
  expect(events).toEqual(['released']);
});

test('await using disposes a handler; a second dispose() waits for the first', async () => {
  const events: string[] = [];
  {
    await using handler = createFetchHandler({ router, layer: pool(events) });
    expect(await (await get(handler, 'pool')).text()).toContain('1');
    const first = handler.dispose();
    await handler.dispose();
    expect(events).toEqual(['released']);
    await first;
  }
  expect(events).toEqual(['released']);
});

test("makeFetchHandler reads services from its Effect's context, and the end of its scope disposes it", async () => {
  const program = Effect.gen(function* () {
    const handler = yield* makeFetchHandler({
      router,
      websocket: { drainTimeout: 0 },
    });
    const id = yield* Effect.promise(async () =>
      (await get(handler, 'pool')).text(),
    );
    return { id, stuck: get(handler, 'stuck') };
  }).pipe(Effect.scoped, Effect.provideService(Pool, { id: 7 }));
  const served = await Effect.runPromise(program);
  expect(served.id).toContain('7');
  expect((await served.stuck).status).toBe(503);

  const unprovided = () =>
    Effect.runPromise(
      // @ts-expect-error -- the router's procedures need Pool
      Effect.scoped(makeFetchHandler({ router })),
    );
  expect(unprovided).toBeTypeOf('function');
});
