import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { TRPCClient } from '@trpc/client';
import { createTRPCClient, httpBatchLink, routerType } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();
const appRouter = t.router({
  post: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query((opts) => ({ id: opts.input.id })),
  },
});
type AppRouter = typeof appRouter;

test('createTRPCClient takes the router type as `router`', async () => {
  await using ctx = testServerAndClientResource(appRouter);
  const client = createTRPCClient({
    router: routerType<AppRouter>(),
    links: [httpBatchLink({ url: ctx.httpUrl })],
  });

  expectTypeOf(client).toEqualTypeOf<TRPCClient<AppRouter>>();
  expect(await client.post.byId.query({ id: '1' })).toEqual({ id: '1' });

  void (() => {
    // @ts-expect-error -- `id` is a string
    void client.post.byId.query({ id: 1 });
    // @ts-expect-error -- not a procedure of the router
    void client.post.nope.query();
  });
});

test('the type argument form still works', async () => {
  await using ctx = testServerAndClientResource(appRouter);
  const client = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: ctx.httpUrl })],
  });

  expectTypeOf(client).toEqualTypeOf<TRPCClient<AppRouter>>();
  expect(await client.post.byId.query({ id: '1' })).toEqual({ id: '1' });
});

test('types read from createTRPCClient stay the same', () => {
  // the last overload is the one with a type argument
  expectTypeOf<ReturnType<typeof createTRPCClient>>().toEqualTypeOf<
    TRPCClient<any>
  >();
  expectTypeOf<ReturnType<typeof createTRPCClient<AppRouter>>>().toEqualTypeOf<
    TRPCClient<AppRouter>
  >();
});

test('`router` must be a routerType', () => {
  void (() => {
    createTRPCClient({
      // @ts-expect-error -- pass `routerType<AppRouter>()`, not the router
      router: appRouter,
      links: [httpBatchLink({ url: 'http://localhost' })],
    });
  });
});

test('routerType is a runtime no-op', () => {
  expect(routerType<AppRouter>()).toEqual({});
});
