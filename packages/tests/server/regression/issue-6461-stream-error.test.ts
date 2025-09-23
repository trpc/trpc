import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { httpBatchStreamLink, TRPCClientError } from '@trpc/client';
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
  await using ctx = testServerAndClientResource(appRouter, {
    client(opts) {
      return {
        links: [httpBatchStreamLink({ url: opts.httpUrl })],
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

  expect(err).toMatchInlineSnapshot(`DOMException {}`);
});
