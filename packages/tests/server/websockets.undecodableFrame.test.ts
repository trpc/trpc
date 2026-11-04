import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import {
  createDeferred,
  makeAsyncResource,
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

function setup() {
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
  const ctx = testServerAndClientResource(router, {
    clientLink: 'wsLink',
    wssServer: {
      createContext: () => ({ connection: ++connections }),
    },
  });

  /** Starts a query the server doesn't answer, and returns its wire id. */
  async function startPendingQuery() {
    const ids: unknown[] = [];
    for (const client of ctx.wss.clients) {
      client.on('message', (raw) => {
        // oxlint-disable-next-line typescript/no-base-to-string
        const text = raw.toString();
        if (text.includes('"pending"')) ids.push(JSON.parse(text).id);
      });
    }
    const inFlight = ctx.client.pending.query();
    await started.promise;
    return { inFlight, id: ids[0] };
  }

  function sendFrame(frame: string) {
    for (const client of ctx.wss.clients) {
      client.send(frame);
    }
  }

  return makeAsyncResource(
    Object.assign(ctx, { startPendingQuery, sendFrame }),
    async () => pending.resolve('done'),
  );
}

test.each([
  { name: 'not json', frame: () => 'not json', thrown: SyntaxError },
  { name: '42', frame: () => '42', thrown: TypeError },
  { name: '{}', frame: () => '{}', thrown: TypeError },
  { name: '[]', frame: () => '[]', thrown: TypeError },
  {
    name: 'result: null',
    frame: (id: unknown) => JSON.stringify({ id, result: null }),
    thrown: TypeError,
  },
  {
    name: 'id: {}',
    frame: () => JSON.stringify({ id: {}, result: { type: 'data', data: 1 } }),
    thrown: TypeError,
  },
  {
    name: 'error: null',
    frame: (id: unknown) => JSON.stringify({ id, error: null }),
    thrown: TypeError,
  },
])(
  'an undecodable frame ($name) fails the requests in flight and reconnects',
  async ({ frame, thrown }) => {
    using g = captureUncaught();
    await using ctx = setup();

    expect(await ctx.client.connection.query()).toBe(1);
    const { inFlight, id } = await ctx.startPendingQuery();
    ctx.sendFrame(frame(id));

    await expect(inFlight).rejects.toMatchObject({ name: 'TRPCClientError' });
    expect(await ctx.client.connection.query()).toBe(2);
    await vi.waitFor(() => {
      expect(g.uncaught).toEqual([expect.any(thrown)]);
    });
  },
);

test('a response that can not be transformed fails only its request', async () => {
  using g = captureUncaught();
  await using ctx = setup();

  expect(await ctx.client.connection.query()).toBe(1);
  const { inFlight, id } = await ctx.startPendingQuery();
  ctx.sendFrame(JSON.stringify({ id, error: {} }));

  await expect(inFlight).rejects.toMatchObject({ name: 'TRPCClientError' });
  expect(await ctx.client.connection.query()).toBe(1);
  expect(g.uncaught).toEqual([]);
});
