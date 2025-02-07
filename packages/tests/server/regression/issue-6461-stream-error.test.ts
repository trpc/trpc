import { routerToServerAndClientNew, waitError } from '../___testHelpers';
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
  const ctx = makeAsyncResource(
    routerToServerAndClientNew(appRouter, {
      client(opts) {
        return {
          links: [unstable_httpBatchStreamLink({ url: opts.httpUrl })],
        };
      },
    }),
    async () => {
      await ctx.close();
    },
  );

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

  expect(err).toBeInstanceOf(TRPCClientError);
  expect(err.cause).toBeInstanceOf(DOMException);
  expect((err.cause as DOMException).name).toBe('AbortError');

  expect(err).toMatchInlineSnapshot();
});
