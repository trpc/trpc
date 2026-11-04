import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import {
  createDeferred,
  makeResource,
} from '@trpc/server/unstable-core-do-not-import';

/**
 * A frame the client can't decode may have carried a response, so the
 * client treats it as a lost connection instead of waiting forever.
 */
function captureUncaught() {
  const uncaught: unknown[] = [];
  const onUncaught = (cause: unknown) => uncaught.push(cause);
  process.on('uncaughtException', onUncaught);
  return makeResource({ uncaught }, () => {
    process.off('uncaughtException', onUncaught);
  });
}

test.each([
  { frame: 'not json', thrown: SyntaxError },
  { frame: '42', thrown: TypeError },
  { frame: '{}', thrown: TypeError },
  { frame: '[]', thrown: TypeError },
])(
  'an undecodable frame ($frame) fails the requests in flight and reconnects',
  async ({ frame, thrown }) => {
    using g = captureUncaught();
    const t = initTRPC.context<{ connection: number }>().create();
    const pending = createDeferred<string>();
    const started = createDeferred<void>();
    const router = t.router({
      connection: t.procedure.query(({ ctx }) => ctx.connection),
      pending: t.procedure.query(() => {
        started.resolve();
        return pending.promise;
      }),
    });
    let connections = 0;
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
      wssServer: {
        createContext: () => ({ connection: ++connections }),
      },
    });
    using _pending = makeResource({}, () => pending.resolve('done'));

    expect(await ctx.client.connection.query()).toBe(1);
    const inFlight = ctx.client.pending.query();
    await started.promise;

    for (const client of ctx.wss.clients) {
      client.send(frame);
    }

    await expect(inFlight).rejects.toMatchObject({ name: 'TRPCClientError' });
    expect(await ctx.client.connection.query()).toBe(2);
    await vi.waitFor(() => {
      expect(g.uncaught).toEqual([expect.any(thrown)]);
    });
  },
);
