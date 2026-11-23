import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import { createDeferred, lazy } from '@trpc/server/unstable-core-do-not-import';

test('retries a rejected lazy router load and caches the successful load', async () => {
  const t = initTRPC.create();
  const child = t.router({ hello: t.procedure.query(() => 'world') });
  const loader = vi.fn(async () => child);
  loader.mockRejectedValueOnce(new Error('Loading failed'));
  const router = t.router({ child: lazy(loader) });

  await using ctx = testServerAndClientResource(router);

  await expect(ctx.client.child.hello.query()).rejects.toThrow(
    'Loading failed',
  );
  expect(loader).toHaveBeenCalledTimes(1);
  await expect(ctx.client.child.hello.query()).resolves.toBe('world');
  await expect(ctx.client.child.hello.query()).resolves.toBe('world');
  expect(loader).toHaveBeenCalledTimes(2);
});

test('concurrent calls share an in-flight lazy router load', async () => {
  const t = initTRPC.create();
  const ready = createDeferred();
  const loader = vi.fn(async () => {
    await ready.promise;
    return t.router({ hello: t.procedure.query(() => 'world') });
  });
  const router = t.router({ child: lazy(loader) });

  await using ctx = testServerAndClientResource(router);

  const first = ctx.client.child.hello.query();
  const second = ctx.client.child.hello.query();
  await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
  ready.resolve();

  await expect(Promise.all([first, second])).resolves.toEqual([
    'world',
    'world',
  ]);
  await expect(ctx.client.child.hello.query()).resolves.toBe('world');
  expect(loader).toHaveBeenCalledTimes(1);
});
