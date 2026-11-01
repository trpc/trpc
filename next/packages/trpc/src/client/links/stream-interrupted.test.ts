import { MessageChannel } from 'node:worker_threads';
import type { Effect } from 'effect';
import {
  createTrpcClient,
  experimental_messagePortLink,
  httpLink,
  matchError,
  routerType,
  safe,
  wsLink,
  type LinkErrorCode,
} from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import { error, initTrpc } from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { ScriptedWebSocket } from '../../fixtures/scripted-websocket.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';

const t = initTrpc();
const router = t.router({
  plain: t.procedure.query(() => ({ n: 1 })),
  failing: t.procedure.query(() => error({ code: 'NOT_FOUND' })),
  deferred: t.procedure.query(() => ({ n: 1, later: Promise.resolve(2) })),
  feed: t.procedure.query(async function* () {
    yield 1;
    yield 2;
  }),
  upload: t.procedure.mutation(async function* () {
    yield 1;
  }),
  ticks: t.procedure.subscription(async function* () {
    yield 1;
  }),
});
type AppRouter = typeof router;

type ErrorOf<P> = P extends (...args: any[]) => { '~error'?: infer E }
  ? E
  : never;
type LinkCodesIn<E> = Extract<
  E extends { readonly code: infer C } ? C : never,
  LinkErrorCode
>;
type Unstreamed = Exclude<LinkErrorCode, 'STREAM_INTERRUPTED'>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('STREAM_INTERRUPTED is in the union only for calls that stream: subscriptions and AsyncIterable outputs', () => {
  const ws = wsLink({ url: 'ws://localhost/trpc' });
  const port = new MessageChannel().port1;
  for (const links of [
    [httpLink({ url: 'http://localhost/trpc' })],
    [ws],
    [experimental_messagePortLink({ port })],
  ] as const) {
    const client = createTrpcClient({ router: routerType<AppRouter>(), links });
    expectTypeOf<
      LinkCodesIn<ErrorOf<typeof client.plain.query>>
    >().toEqualTypeOf<Unstreamed>();
    expectTypeOf<
      LinkCodesIn<ErrorOf<typeof client.failing.query>>
    >().toEqualTypeOf<Unstreamed>();
    // A deferred value rejects on its own; the call already resolved.
    expectTypeOf<
      LinkCodesIn<ErrorOf<typeof client.deferred.query>>
    >().toEqualTypeOf<Unstreamed>();
    expectTypeOf<
      LinkCodesIn<ErrorOf<typeof client.feed.query>>
    >().toEqualTypeOf<LinkErrorCode>();
    expectTypeOf<
      LinkCodesIn<ErrorOf<typeof client.upload.mutate>>
    >().toEqualTypeOf<LinkErrorCode>();
    expectTypeOf<
      LinkCodesIn<ErrorOf<typeof client.ticks.subscribe>>
    >().toEqualTypeOf<LinkErrorCode>();
  }
  port.close();
  void ws[Symbol.asyncDispose]();

  const effectClient = createEffectClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: 'http://localhost/trpc' })],
  });
  expectTypeOf<
    LinkCodesIn<Effect.Error<ReturnType<typeof effectClient.plain.query>>>
  >().toEqualTypeOf<Unstreamed>();
  expectTypeOf<
    LinkCodesIn<Effect.Error<ReturnType<typeof effectClient.feed.query>>>
  >().toEqualTypeOf<LinkErrorCode>();
});

test('matchError takes STREAM_INTERRUPTED only for a call that streams', async () => {
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: 'http://localhost/trpc' })],
  });
  const [, plain] = await safe(client.plain.query());
  const [, feed] = await safe(client.feed.query());
  const handlers = {
    NETWORK_ERROR: () => 'offline',
    BAD_RESPONSE: () => 'bad',
    unexpected: () => 'unexpected',
  } satisfies Record<string, () => string>;
  expect(matchError(plain!, handlers)).toBe('offline');
  matchError(plain!, {
    ...handlers,
    // @ts-expect-error: a plain call can't be interrupted
    STREAM_INTERRUPTED: () => 'cut',
  });
  expect(
    matchError(feed!, { ...handlers, STREAM_INTERRUPTED: () => 'cut' }),
  ).toBe('offline');
  // @ts-expect-error: a streamed output can be cut
  matchError(feed!, handlers);
});

/** `httpLink` over a fetch that keeps only the first `bytes` of each body. */
const cutAt = (bytes: (body: string) => number) => {
  const cutting: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    const body = await res.text();
    return new Response(body.slice(0, bytes(body)), {
      status: res.status,
      headers: res.headers,
    });
  };
  return cutting;
};

const cuts: ReadonlyArray<[string, (body: string) => number]> = [
  ['before the first byte', () => 0],
  ['after one byte', () => 1],
  ['mid-way', (body) => Math.floor(body.length / 2)],
  ['before the last byte', (body) => body.length - 1],
  ['after the first line', (body) => body.indexOf('\n') + 1],
];

test('httpLink: a cut response never fails a plain call with STREAM_INTERRUPTED, single or batched', async () => {
  await using server = await createTestServer({ router, batch: true });
  const seen: Record<string, string> = {};
  for (const [name, bytes] of cuts) {
    for (const batch of [false, true]) {
      const client = createTrpcClient({
        router: routerType<AppRouter>(),
        links: [httpLink({ url: server.url, batch, fetch: cutAt(bytes) })],
      });
      const calls = {
        plain: () => client.plain.query(),
        deferred: () => client.deferred.query(),
      };
      for (const [path, call] of Object.entries(calls)) {
        const [, err] = await safe(call());
        const code = err?.code ?? 'ok';
        seen[`${batch ? 'batched' : 'single'} ${path} ${name}`] = code;
        expect(code).not.toBe('STREAM_INTERRUPTED');
      }
    }
  }
  // A streamed head that never came is a cut connection, like a cut line.
  expect(seen['single deferred before the first byte']).toBe('NETWORK_ERROR');
  expect(seen['single deferred mid-way']).toBe('NETWORK_ERROR');
  expect(seen['single plain before the first byte']).toBe('BAD_RESPONSE');
  expect(seen['batched plain before the first byte']).toBe('BAD_RESPONSE');
});

test('httpLink: once a streamed call resolved, what it left open is STREAM_INTERRUPTED', async () => {
  await using server = await createTestServer({ router, batch: true });
  const firstLine = cutAt((body) => body.indexOf('\n') + 1);
  for (const batch of [false, true]) {
    const client = createTrpcClient({
      router: routerType<AppRouter>(),
      links: [httpLink({ url: server.url, batch, fetch: firstLine })],
    });
    const out = await client.deferred.query();
    await expect(out.later).rejects.toMatchObject({
      code: 'STREAM_INTERRUPTED',
    });
    const [, feed] = await safe(
      (async () => {
        for await (const _ of await client.feed.query());
      })(),
    );
    expect(feed).toMatchObject({ code: 'STREAM_INTERRUPTED' });
  }
});

const scripted = () => {
  ScriptedWebSocket.opened = [];
  const link = wsLink({
    url: 'ws://scripted',
    WebSocket: ScriptedWebSocket as unknown as typeof WebSocket,
    keepAlive: false,
    reconnect: { attempts: 0 },
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [link],
  });
  const socket = async () => {
    while (!ScriptedWebSocket.opened[0]) await sleep(1);
    return ScriptedWebSocket.opened[0];
  };
  return { link, client, socket };
};

test('wsLink: a connection lost before the result is NETWORK_ERROR; after a deferred result, only its values are cut', async () => {
  {
    const app = scripted();
    const call = safe(app.client.plain.query());
    const ws = await app.socket();
    await ws.request('plain');
    ws.close();
    expect((await call).error).toMatchObject({ code: 'NETWORK_ERROR' });
    await app.link.close();
  }
  {
    const app = scripted();
    const call = app.client.deferred.query();
    const ws = await app.socket();
    const request = await ws.request('deferred');
    ws.receive({
      id: request.id,
      type: 'result',
      deferred: true,
      body: { json: { n: 1, later: null }, d: [[['later'], 0, 'Promise']] },
    });
    ws.receive({ id: request.id, type: 'done' });
    const out = await call;
    expect(out.n).toBe(1);
    await expect(out.later).rejects.toMatchObject({
      code: 'STREAM_INTERRUPTED',
    });
    await app.link.close();
  }
});

test('experimental_messagePortLink: a port closed before the result is NETWORK_ERROR', async () => {
  const channel = new MessageChannel();
  const requested = new Promise<void>((resolve) =>
    channel.port2.on('message', (message: { type?: string }) => {
      if (message.type === 'request') resolve();
    }),
  );
  const link = experimental_messagePortLink({ port: channel.port1 });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [link],
  });
  const call = safe(client.plain.query());
  await requested;
  channel.port2.close();
  expect((await call).error).toMatchObject({ code: 'NETWORK_ERROR' });
  await link.close();
});
