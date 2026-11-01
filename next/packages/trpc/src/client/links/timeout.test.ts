import { Effect } from 'effect';
import {
  createSafeClient,
  createTrpcClient,
  httpLink,
  localLink,
  matchError,
  routerType,
  safe,
  wsLink,
  type AnyLink,
} from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import { initTrpc } from '@trpc12/trpc/server';
import {
  createTestServer,
  type NodeTestServer,
} from '../../fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';

const t = initTrpc();
const slow = t.procedure.query(
  (opts) =>
    new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve('late'), 5000);
      opts.signal.addEventListener('abort', () => clearTimeout(timer));
    }),
);
const router = t.router({ slow });
type AppRouter = typeof router;

const serve = () => createTestServer({ router, batch: true });

const LINKS = {
  httpLink: (server) => httpLink({ url: server.url }),
  'httpLink, batched': (server) => httpLink({ url: server.url, batch: true }),
  wsLink: (server) => wsLink({ url: server.wsUrl }),
  localLink: () => localLink({ router }),
} satisfies Record<string, (server: NodeTestServer) => AnyLink>;

/** A test server and one of {@link LINKS} to it, disposed together. */
const serveOver = async (name: keyof typeof LINKS) => {
  const server = await serve();
  const link = LINKS[name](server);
  return {
    link,
    [Symbol.asyncDispose]: async () => {
      if (Symbol.asyncDispose in link) await link[Symbol.asyncDispose]();
      await server.close();
    },
  };
};

const names = Object.keys(LINKS) as Array<keyof typeof LINKS>;

test.for(names)(
  'a call whose signal times out fails with TIMEOUT over %s',
  async (name) => {
    await using served = await serveOver(name);
    const client = createTrpcClient({
      router: routerType<AppRouter>(),
      links: [served.link],
    });
    const [, err] = await safe(
      client.slow.query(undefined, { signal: AbortSignal.timeout(20) }),
    );
    expect(err).toMatchObject({
      code: 'TIMEOUT',
      message: 'The request timed out',
      defined: false,
    });
    expect((err?.cause as Error | undefined)?.name).toBe('TimeoutError');
  },
);

test.for(names)(
  'any other abort still fails with CLIENT_CLOSED_REQUEST over %s',
  async (name) => {
    await using served = await serveOver(name);
    const client = createTrpcClient({
      router: routerType<AppRouter>(),
      links: [served.link],
    });
    const controller = new AbortController();
    const pending = safe(
      client.slow.query(undefined, { signal: controller.signal }),
    );
    setTimeout(() => controller.abort(), 20);
    const [, err] = await pending;
    expect(err).toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  },
);

test('a timeout joined with a cancel fails with whichever aborted first', async () => {
  await using server = await serve();
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  const controller = new AbortController();
  const [, timedOut] = await safe(
    client.slow.query(undefined, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20)]),
    }),
  );
  expect(timedOut).toMatchObject({ code: 'TIMEOUT' });

  const cancelled = safe(
    client.slow.query(undefined, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
    }),
  );
  setTimeout(() => controller.abort(), 20);
  expect((await cancelled)[1]).toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
});

test.for(names)(
  'the Effect client fails a call whose signal times out with TIMEOUT over %s',
  async (name) => {
    await using served = await serveOver(name);
    const client = createEffectClient({
      router: routerType<AppRouter>(),
      links: [served.link],
    });
    const code = await Effect.runPromise(
      client.slow.query(undefined, { signal: AbortSignal.timeout(20) }).pipe(
        Effect.catchTag('Timeout', (e) => Effect.succeed(e.code)),
        Effect.catch((e) => Effect.succeed(`other: ${e.code}`)),
      ),
    );
    expect(code).toBe('TIMEOUT');
  },
);

test("httpLink fails with TIMEOUT when its fetch's own signal times out", async () => {
  await using server = await serve();
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({
        url: server.url,
        fetch: (url, init) =>
          fetch(url, {
            ...init,
            signal: AbortSignal.any([
              AbortSignal.timeout(20),
              ...(init.signal ? [init.signal] : []),
            ]),
          }),
      }),
    ],
  });
  const [, err] = await safe(client.slow.query());
  expect(err).toMatchObject({ code: 'TIMEOUT' });
});

test('the safe client and matchError() get TIMEOUT as an unexpected error', async () => {
  await using server = await serve();
  const safeClient = createSafeClient(
    createTrpcClient({
      router: routerType<AppRouter>(),
      links: [httpLink({ url: server.url })],
    }),
  );
  const [, err] = await safeClient.slow.query(undefined, {
    signal: AbortSignal.timeout(20),
  });
  expect(err).toMatchObject({ code: 'TIMEOUT' });
  if (!err) return;
  expectTypeOf<Extract<typeof err, { code: 'TIMEOUT' }>>().not.toBeNever();
  const shown = matchError(err, {
    NETWORK_ERROR: () => 'You are offline',
    BAD_RESPONSE: () => 'Try again later',
    unexpected: (e) => (e.code === 'TIMEOUT' ? 'That took too long' : null),
  });
  expect(shown).toBe('That took too long');
});

test('t.call() fails with TIMEOUT when its signal times out', async () => {
  await expect(
    t.call(slow, undefined, { signal: AbortSignal.timeout(20) }),
  ).rejects.toMatchObject({ code: 'TIMEOUT' });
});
