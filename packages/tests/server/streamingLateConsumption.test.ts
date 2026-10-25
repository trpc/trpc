import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { httpBatchStreamLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';

test('reads a streamed query after the HTTP response has finished', async () => {
  const t = initTRPC.create();
  const router = t.router({
    values: t.procedure.query(async function* () {
      yield 1;
      yield 2;
      return 'done';
    }),
  });
  let signal: AbortSignal | null | undefined;
  await using ctx = testServerAndClientResource(router, {
    client(opts) {
      return {
        links: [
          httpBatchStreamLink({
            url: opts.httpUrl,
            fetch(url, init) {
              signal = init?.signal;
              return fetch(url, init);
            },
          }),
        ],
      };
    },
  });

  const values = await ctx.client.values.query();
  await vi.waitFor(() => expect(signal?.aborted).toBe(true));

  const iterator = values[Symbol.asyncIterator]();
  await expect(iterator.next()).resolves.toEqual({ value: 1, done: false });
  await expect(iterator.next()).resolves.toEqual({ value: 2, done: false });
  await expect(iterator.next()).resolves.toEqual({ value: 'done', done: true });
});
