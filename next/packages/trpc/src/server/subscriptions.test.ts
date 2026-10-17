import { Effect, Schedule, Stream } from 'effect';
import { EventSource } from 'undici';
import {
  createTrpcClient,
  httpLink,
  type TrpcClient,
  routerType,
} from '@trpc12/trpc/client';
import {
  error,
  initTrpc,
  tracked,
  type TrackedEnvelope,
} from '@trpc12/trpc/server';
import {
  createTestServer,
  type NodeTestServer as TestServer,
} from '../fixtures/server.ts';
import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
import { z } from 'zod';

interface Context {
  user: string | null;
}
const t = initTrpc<{ ctx: Context }>();

const authed = t.procedure.use(({ ctx, next }) =>
  ctx.user
    ? next({ ctx: { user: ctx.user } })
    : error({ code: 'UNAUTHORIZED', message: 'Sign in first' }),
);

const state = { cleanups: 0, lastEventIds: [] as (string | undefined)[] };
let current: TestServer | undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const router = {
  countdown: t.procedure
    .input(z.object({ from: z.number() }))
    .subscription(async function* ({ input }) {
      for (let n = input.from; n >= 0; n--) yield n;
    }),
  ticks: t.procedure.subscription(async function* ({ signal }) {
    try {
      let n = 0;
      while (!signal.aborted) {
        yield n++;
        await sleep(5);
      }
    } finally {
      state.cleanups++;
    }
  }),
  posts: t.procedure.subscription(async function* ({ lastEventId }) {
    state.lastEventIds.push(lastEventId);
    const start = lastEventId ? Number(lastEventId) + 1 : 1;
    for (let id = start; id <= 4; id++) {
      yield tracked(String(id), { id, title: `Post ${id}` });
      if (id === 2 && !lastEventId) {
        await sleep(10);
        current!.server.closeAllConnections();
        await sleep(50);
      }
    }
  }),
  failsMidway: t.procedure.subscription(async function* () {
    yield 1;
    throw error({ code: 'CONFLICT', message: 'Gone' });
  }),
  effectTicks: t.procedure.subscription(() =>
    Stream.fromSchedule(Schedule.spaced('1 millis')).pipe(
      Stream.map((n) => ({ tick: n })),
      Stream.take(3),
    ),
  ),
  effectFails: t.procedure.subscription(() =>
    Stream.make(1, 2).pipe(
      Stream.concat(Stream.fail(error({ code: 'TOO_MANY_REQUESTS' }))),
    ),
  ),
  uploads: t.procedure.subscription(async function* () {
    for (const name of ['big.mov', 'small.txt']) {
      yield tracked(name, {
        name,
        size: (async () => {
          await sleep(name === 'big.mov' ? 30 : 5);
          return name.length * 1000;
        })(),
        progress: (async function* () {
          yield 50;
          await sleep(5);
          yield 100;
        })(),
      });
    }
  }),
  secret: authed.subscription(async function* ({ ctx }) {
    yield `hi ${ctx.user}`;
  }),
  quiet: t.procedure.subscription(async function* ({ signal }) {
    await new Promise((resolve) =>
      signal.addEventListener('abort', resolve, { once: true }),
    );
    yield 'late';
  }),
};
type AppRouter = typeof router;

async function setup(user: string | null = 'ada') {
  const server = await createTestServer({
    router,
    createContext: () => ({ user }),
  });
  current = server;
  const client: TrpcClient<AppRouter> = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, reconnect: { delayMs: () => 10 } })],
  });
  return { server, client, [Symbol.asyncDispose]: () => server.close() };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

test('an async generator streams over SSE until it returns', async () => {
  await using ctx = await setup();
  const subscription = ctx.client.countdown.subscribe({ from: 3 });
  expectTypeOf(subscription).toExtend<AsyncIterable<number>>();
  expect(await collect(subscription)).toEqual([3, 2, 1, 0]);
  const request = ctx.server.requests.at(-1)!;
  expect(request.method).toBe('GET');
  expect(request.headers.get('accept')).toBe('text/event-stream');
});

test('breaking out of the loop stops the server-side generator', async () => {
  await using ctx = await setup();
  const before = state.cleanups;
  const seen: number[] = [];
  for await (const n of ctx.client.ticks.subscribe()) {
    seen.push(n);
    if (n === 2) break;
  }
  expect(seen).toEqual([0, 1, 2]);
  await vi.waitFor(() => expect(state.cleanups).toBe(before + 1));
});

test('aborting the signal ends the subscription quietly', async () => {
  await using ctx = await setup();
  const before = state.cleanups;
  const controller = new AbortController();
  const seen: number[] = [];
  for await (const n of ctx.client.ticks.subscribe(undefined, {
    signal: controller.signal,
  })) {
    seen.push(n);
    if (n === 1) controller.abort();
  }
  expect(seen.slice(0, 2)).toEqual([0, 1]);
  await vi.waitFor(() => expect(state.cleanups).toBe(before + 1));
});

test('a signal aborted before subscribing yields nothing and sends nothing', async () => {
  await using ctx = await setup();
  const requests = ctx.server.requests.length;
  const seen: number[] = [];
  for await (const n of ctx.client.ticks.subscribe(undefined, {
    signal: AbortSignal.abort(),
  })) {
    seen.push(n);
  }
  expect(seen).toEqual([]);
  expect(ctx.server.requests.length).toBe(requests);
});

test('tracked() events reconnect from the last event id', async () => {
  await using ctx = await setup();
  state.lastEventIds = [];
  const events = await collect(ctx.client.posts.subscribe());
  expectTypeOf(events).toEqualTypeOf<
    TrackedEnvelope<{ id: number; title: string }>[]
  >();
  expect(events.map((e) => e.id)).toEqual(['1', '2', '3', '4']);
  expect(events[0]!.data).toEqual({ id: 1, title: 'Post 1' });
  expect(state.lastEventIds).toEqual([undefined, '2']);
  expect(ctx.server.requests.at(-1)!.headers.get('last-event-id')).toBe('2');
});

test('tracked() rejects ids that would split an SSE frame', () => {
  expect(() => tracked('1\ndata: forged', null)).toThrow(/line breaks/);
  expect(() => tracked('1\r2', null)).toThrow(/line breaks/);
  expect(() => tracked('a\0', null)).toThrow(/NUL/);
  expect(tracked('post:1', null).id).toBe('post:1');
});

test('reconnect: false ends the subscription when the connection drops', async () => {
  await using ctx = await setup();
  state.lastEventIds = [];
  const seen: number[] = [];
  await expect(async () => {
    for await (const event of ctx.client.posts.subscribe(undefined, {
      reconnect: false,
    })) {
      seen.push(event.data.id);
    }
  }).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  expect(seen).toEqual([1, 2]);
  expect(state.lastEventIds).toEqual([undefined]);
});

test('subscribe() can resume from a known event id', async () => {
  await using ctx = await setup();
  const events = await collect(
    ctx.client.posts.subscribe(undefined, { lastEventId: '3' }),
  );
  expect(events.map((e) => e.data.id)).toEqual([4]);
});

test('an error thrown mid-stream reaches the loop', async () => {
  await using ctx = await setup();
  const seen: number[] = [];
  await expect(async () => {
    for await (const n of ctx.client.failsMidway.subscribe()) seen.push(n);
  }).rejects.toMatchObject({ code: 'CONFLICT', defined: false });
  expect(seen).toEqual([1]);
});

test('an Effect Stream is a subscription', async () => {
  await using ctx = await setup();
  const events = await collect(ctx.client.effectTicks.subscribe());
  expectTypeOf(events).toEqualTypeOf<{ tick: number }[]>();
  expect(events).toEqual([{ tick: 0 }, { tick: 1 }, { tick: 2 }]);
});

test('a Stream failure is a typed error', async () => {
  await using ctx = await setup();
  const seen: number[] = [];
  const err = await (async () => {
    try {
      for await (const n of ctx.client.effectFails.subscribe()) seen.push(n);
    } catch (cause) {
      return cause;
    }
    return undefined;
  })();
  expect(seen).toEqual([1, 2]);
  expect(err).toMatchObject({
    code: 'TOO_MANY_REQUESTS',
    defined: true,
  });
});

test('middleware errors fail the subscription before it starts', async () => {
  await using ctx = await setup(null);
  await expect(collect(ctx.client.secret.subscribe())).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
    defined: true,
  });
  await using authed = await setup('sam');
  expect(await collect(authed.client.secret.subscribe())).toEqual(['hi sam']);
});

test('the wire format is plain SSE', async () => {
  await using ctx = await setup();
  const res = await fetch(`${ctx.server.url}/posts`, {
    headers: { 'last-event-id': '2' },
  });
  expect(res.headers.get('content-type')).toBe('text/event-stream');
  const text = await res.text();
  expect(text).toContain('id: 3\ndata: ');
  expect(text.trimEnd().endsWith('event: done\ndata:')).toBe(true);
});

test('a real EventSource reads events, reconnects with Last-Event-ID and sees done', async () => {
  await using ctx = await setup();
  state.lastEventIds.length = 0;
  const source = new EventSource(`${ctx.server.url}/posts`, {
    node: { reconnectionTime: 10 },
  });
  const ids: string[] = [];
  const titles: string[] = [];
  let opened = 0;
  source.addEventListener('open', () => opened++);
  await new Promise<void>((resolve) => {
    source.addEventListener('message', (event) => {
      ids.push(event.lastEventId);
      titles.push(JSON.stringify(JSON.parse(event.data)));
    });
    source.addEventListener('done', () => {
      source.close();
      resolve();
    });
  });
  expect(ids).toEqual(['1', '2', '3', '4']);
  expect(titles.every((t, i) => t.includes(`Post ${i + 1}`))).toBe(true);
  expect(opened).toBe(2);
  expect(state.lastEventIds).toEqual([undefined, '2']);
});

test('a real EventSource gets error events as MessageEvents with data', async () => {
  await using ctx = await setup();
  const source = new EventSource(`${ctx.server.url}/failsMidway`);
  const failure = await new Promise<string>((resolve) => {
    source.addEventListener('error', (event) => {
      if ('data' in event && typeof event.data === 'string') {
        resolve(event.data);
      }
    });
  });
  source.close();
  expect(failure).toContain('CONFLICT');
});

test('the response opens before the first event', async () => {
  await using ctx = await setup();
  const controller = new AbortController();
  const res = await fetch(`${ctx.server.url}/quiet`, {
    signal: controller.signal,
  });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('text/event-stream');
  controller.abort();
});

test('events can hold deferred values; their chunks stream after the event', async () => {
  await using ctx = await setup();
  const uploads = await collect(ctx.client.uploads.subscribe());
  expect(uploads.map((u) => u.id)).toEqual(['big.mov', 'small.txt']);
  expectTypeOf(uploads[0]!.data.size).toEqualTypeOf<Promise<number>>();
  expectTypeOf(uploads[0]!.data.progress).toExtend<AsyncIterable<number>>();
  expect(await Promise.all(uploads.map((u) => u.data.size))).toEqual([
    7000, 9000,
  ]);
  expect(await collect(uploads[1]!.data.progress)).toEqual([50, 100]);
});

test('quiet subscriptions send keep-alive comments', async () => {
  const pinged = {
    slow: t.procedure.subscription(async function* () {
      yield 'a';
      await sleep(60);
      yield 'b';
    }),
  };
  await using server = await createTestServer({
    router: pinged,
    createContext: () => ({ user: null }),
    sse: { pingMs: 10 },
  });
  const text = await (await fetch(`${server.url}/slow`)).text();
  expect(text).toContain(': ping\n\n');
  const client = createTrpcClient({
    router: routerType<typeof pinged>(),
    links: [httpLink({ url: server.url })],
  });
  expect(await collect(client.slow.subscribe())).toEqual(['a', 'b']);
});

test('without keep-alives a subscription sends only its events; one that interrupts itself just ends', async () => {
  await using server = await createTestServer({
    router: {
      slow: t.procedure.subscription(async function* () {
        yield 'a';
        await sleep(30);
        yield 'b';
      }),
      stops: t.procedure.subscription(() =>
        Stream.concat(Stream.make('a'), Stream.fromEffect(Effect.interrupt)),
      ),
    },
    createContext: () => ({ user: null }),
    sse: { pingMs: false },
  });
  const text = await (await fetch(`${server.url}/slow`)).text();
  expect(text).not.toContain(': ping');
  expect(text).toContain('event: done');

  const stopped = await (await fetch(`${server.url}/stops`)).text();
  expect(stopped).toContain('data: {"json":"a"}');
  expect(stopped).not.toMatch(/event: (done|error)/);
});
