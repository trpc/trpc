import { routerToServerAndClientNew } from '../___testHelpers';
import { waitError } from '@trpc/server/__tests__/waitError';
import { TRPCClientError, unstable_httpBatchStreamLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import {
  makeAsyncResource,
  run,
} from '@trpc/server/unstable-core-do-not-import';

const t = initTRPC.create({});

const appRouter = t.router({
  stream: t.procedure.query(async function* () {
    while (true) {
      yield 'tick';
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }),
});

test('streaming query interruption should throw TRPCClientError', async () => {
  const ctx = routerToServerAndClientNew(appRouter, {
    client(opts) {
      return {
        links: [unstable_httpBatchStreamLink({ url: opts.httpUrl })],
      };
    },
  });

  const err = await waitError(
    run(async () => {
      const ac = new AbortController();
      const q = await ctx.client.stream.query(undefined, {
        signal: ac.signal,
      });
      for await (const _ of q) {
        ac.abort();
      }
    }),
  );

  expect((err as DOMException).name).toBe('AbortError');

  expect(err).toMatchInlineSnapshot(`[AbortError: The operation was aborted.]`);

  await ctx.close();
});
