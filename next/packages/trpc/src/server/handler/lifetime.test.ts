import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import {
  type AnyRouter,
  createFetchHandler,
  createRouterClient,
  initTrpc,
} from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';

class Pool extends Context.Service<Pool, { readonly id: number }>()('Pool') {}

const t = initTrpc();

const router = {
  pool: t.procedure.query(() =>
    Effect.gen(function* () {
      return (yield* Pool).id;
    }),
  ),
} satisfies AnyRouter;

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
