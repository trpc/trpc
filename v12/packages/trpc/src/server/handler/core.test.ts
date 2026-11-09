import { Context, Effect, Layer } from 'effect';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { createHandlerCore } from './core.ts';

class Builds extends Context.Service<Builds, { readonly id: number }>()(
  'Builds',
) {}

const t = initTrpc();

test("the handler's layer is built once, by the first calls, and shared by every call after", async () => {
  let built = 0;
  const handler = createFetchHandler({
    router: t.router({
      build: t.procedure.query(() =>
        Effect.gen(function* () {
          return (yield* Builds).id;
        }),
      ),
    }),
    layer: Layer.effect(
      Builds,
      Effect.map(Effect.sleep(5), () => ({ id: ++built })),
    ),
  });
  const get = async () =>
    (await handler.fetch(new Request('http://localhost/trpc/build'))).text();
  const first = await Promise.all([get(), get(), get()]);
  const later = await get();
  expect(built).toBe(1);
  expect(new Set([...first, later]).size).toBe(1);
  expect(later).toContain('1');
  await handler.dispose();
});

test('dispose() interrupts the sessions forked on the core; one forked after it runs to its end', async () => {
  const events: string[] = [];
  const core = createHandlerCore({});
  core.fork(
    Effect.never.pipe(
      Effect.onInterrupt(() => Effect.sync(() => events.push('interrupted'))),
    ),
  );
  await core.dispose();
  expect(events).toEqual(['interrupted']);
  core.fork(Effect.sync(() => events.push('ran')));
  expect(events).toEqual(['interrupted', 'ran']);
});
