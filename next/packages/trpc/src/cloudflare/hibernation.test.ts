import { Effect, Redacted, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import {
  connectionToken,
  experimental_createHibernatingWebSockets,
  hibernatingPublisher,
  type HibernatableWebSocket,
} from '@trpc12/trpc/cloudflare';
import { createFetchHandler, initTrpc, Publisher } from '@trpc12/trpc/server';
import { jsonSerializer } from '@trpc12/trpc/serializer';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';

interface Env {
  region: string;
}

const t = initTrpc<{
  ctx: {
    token: string | undefined;
    cookie: string | null;
    other: string | null;
    region: string | undefined;
  };
}>();

let ticksStopped = 0;
const router = {
  whoami: t.procedure.query(({ ctx }) => ctx),
  double: t.procedure
    .input(z.object({ n: z.number() }))
    .query(({ input }) => input.n * 2),
  ticks: t.procedure.subscription(async function* () {
    try {
      for (let n = 0; ; n++) {
        yield n;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    } finally {
      ticksStopped++;
    }
  }),
};

const handler = createFetchHandler<typeof router, { env: Env }>({
  router,
  createContext: ({ request, info, platform }) => ({
    token: info.connectionParams?.['token'] as string | undefined,
    cookie: request.headers['cookie'] ?? null,
    other: request.headers['x-other'] ?? null,
    region: platform?.env.region,
  }),
});

/** What a Durable Object's runtime keeps for a hibernated socket. */
class FakeSocket implements HibernatableWebSocket {
  readyState = 1;
  sent: unknown[] = [];
  closed: [number | undefined, string | undefined] | undefined;
  #attachment: unknown;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number, reason?: string) {
    this.readyState = 3;
    this.closed = [code, reason];
  }
  serializeAttachment(value: unknown) {
    this.#attachment = structuredClone(value);
  }
  deserializeAttachment() {
    return structuredClone(this.#attachment);
  }
}

const fakeState = () => ({
  accepted: [] as FakeSocket[],
  autoResponse: undefined as unknown,
  acceptWebSocket(socket: never) {
    this.accepted.push(socket);
  },
  getWebSockets() {
    return this.accepted.filter((s) => s.readyState === 1);
  },
  setWebSocketAutoResponse(pair?: unknown) {
    this.autoResponse = pair;
  },
});

const request = new Request('https://room.example/trpc', {
  headers: { cookie: 'session=1', 'x-other': 'dropped', upgrade: 'websocket' },
});
const platform: { env: Env } = { env: { region: 'weur' } };
const send = (
  sockets: ReturnType<
    typeof experimental_createHibernatingWebSockets<{ env: Env }>
  >,
  socket: FakeSocket,
  message: object,
) => sockets.message(socket, JSON.stringify(message), platform);

test('calls work, and still see the connection after the object wakes', async () => {
  const state = fakeState();
  const socket = new FakeSocket();
  const sockets = experimental_createHibernatingWebSockets(handler, { state });
  sockets.accept(socket, request, platform);
  expect(state.accepted).toEqual([socket]);

  send(sockets, socket, {
    type: 'init',
    version: '12',
    connectionParams: { token: 'kim' },
  });
  send(sockets, socket, {
    id: 1,
    type: 'request',
    method: 'query',
    path: 'double',
    input: jsonSerializer.serialize({ n: 21 }),
  });
  await vi.waitFor(() =>
    expect(socket.sent).toContainEqual({
      id: 1,
      type: 'result',
      body: { json: 42 },
    }),
  );

  // Evicted: a new object instance, the same socket and attachment.
  const woken = experimental_createHibernatingWebSockets(handler, {
    state: fakeState(),
  });
  send(woken, socket, {
    id: 2,
    type: 'request',
    method: 'query',
    path: 'whoami',
  });
  await vi.waitFor(() =>
    expect(socket.sent).toContainEqual({
      id: 2,
      type: 'result',
      body: {
        json: {
          token: 'kim',
          cookie: 'session=1',
          other: null,
          region: 'weur',
        },
      },
    }),
  );
});

test('closing the socket stops its subscriptions', async () => {
  const socket = new FakeSocket();
  const sockets = experimental_createHibernatingWebSockets(handler, {
    state: fakeState(),
  });
  sockets.accept(socket, request, platform);
  const before = ticksStopped;
  send(sockets, socket, {
    id: 1,
    type: 'request',
    method: 'subscription',
    path: 'ticks',
  });
  await vi.waitFor(() =>
    expect(
      socket.sent.filter((m) => (m as { type: string }).type === 'event')
        .length,
    ).toBeGreaterThan(1),
  );
  sockets.close(socket, 1005, '');
  expect(socket.closed).toEqual([1000, '']);
  await vi.waitFor(() => expect(ticksStopped).toBe(before + 1));
});

test('keep-alive pings are answered without waking the object', () => {
  class Pair {
    request: string;
    response: string;
    constructor(request: string, response: string) {
      this.request = request;
      this.response = response;
    }
  }
  vi.stubGlobal('WebSocketRequestResponsePair', Pair);
  const state = fakeState();
  experimental_createHibernatingWebSockets(handler, { state });
  expect(state.autoResponse).toEqual(
    new Pair('{"type":"ping"}', '{"type":"pong"}'),
  );
});

test('upgrade() accepts one end of a WebSocketPair and returns the other', () => {
  const client = new FakeSocket();
  const server = new FakeSocket();
  vi.stubGlobal(
    'WebSocketPair',
    class {
      0 = client;
      1 = server;
    },
  );
  vi.stubGlobal(
    'Response',
    class {
      init: unknown;
      constructor(_body: null, init: unknown) {
        this.init = init;
      }
    },
  );
  const state = fakeState();
  const sockets = experimental_createHibernatingWebSockets(handler, { state });
  const res = sockets.upgrade(request, platform) as unknown as {
    init: { status: number; webSocket: unknown };
  };
  expect(res.init).toEqual({ status: 101, webSocket: client });
  expect(state.accepted).toEqual([server]);
});

test('a socket the adapter did not accept is closed', () => {
  const socket = new FakeSocket();
  const sockets = experimental_createHibernatingWebSockets(handler, {
    state: fakeState(),
  });
  send(sockets, socket, { type: 'ping' });
  expect(socket.closed).toEqual([1011, 'Not a tRPC socket']);
});

test('headers past the 2 KB attachment limit are dropped with a warning', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const socket = new FakeSocket();
  const big = new Request('https://room.example/trpc', {
    headers: { cookie: `session=${'x'.repeat(2100)}` },
  });
  experimental_createHibernatingWebSockets(handler, {
    state: fakeState(),
  }).accept(socket, big, platform);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('cookie'));
  expect(socket.deserializeAttachment()).toMatchObject({ headers: [] });

  const woken = experimental_createHibernatingWebSockets(handler, {
    state: fakeState(),
  });
  send(woken, socket, {
    id: 1,
    type: 'request',
    method: 'query',
    path: 'whoami',
  });
  await vi.waitFor(() =>
    expect(socket.sent).toMatchObject([
      { id: 1, type: 'result', body: { json: { cookie: null } } },
    ]),
  );
});

class Posts extends Publisher.Service<Posts, { created: { title: string } }>()(
  'test/HibernatingPosts',
) {}

const pt = initTrpc();

/** A Durable Object instance: what its constructor builds. */
const room = (state: ReturnType<typeof fakeState>) => {
  const h = createFetchHandler({
    router: {
      create: pt.procedure
        .input(z.object({ title: z.string() }))
        .mutation(({ input }) =>
          Effect.as(Posts.publish('created', input), input),
        ),
      onCreated: pt.procedure
        .output(z.object({ title: z.string().max(10) }))
        .subscription(({ lastEventId }) =>
          Posts.subscribe('created', { lastEventId }),
        ),
    },
    layer: hibernatingPublisher(Posts, { state, buffer: 10 }),
  });
  return experimental_createHibernatingWebSockets(h, { state });
};
const say = (
  sockets: ReturnType<typeof room>,
  socket: FakeSocket,
  message: object,
) => sockets.message(socket, JSON.stringify(message));
const events = (socket: FakeSocket, id: number) =>
  socket.sent.filter(
    (m) =>
      (m as { id?: number }).id === id &&
      (m as { type: string }).type !== 'result',
  );
const create = (
  sockets: ReturnType<typeof room>,
  socket: FakeSocket,
  id: number,
  title: string,
) =>
  say(sockets, socket, {
    id,
    type: 'request',
    method: 'mutation',
    path: 'create',
    input: jsonSerializer.serialize({ title }),
  });

test('publisher subscriptions hibernate: kept on the socket, sent to after a wake', async () => {
  const state = fakeState();
  const sockets = room(state);
  const sub = new FakeSocket();
  const pub = new FakeSocket();
  sockets.accept(sub, request);
  sockets.accept(pub, request);
  say(sockets, sub, {
    id: 1,
    type: 'request',
    method: 'subscription',
    path: 'onCreated',
  });
  await vi.waitFor(() =>
    expect(sub.deserializeAttachment()).toMatchObject({
      subs: [
        { c: 1, k: 'test/HibernatingPosts', ch: 'created', p: 'onCreated' },
      ],
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(sub.sent).toEqual([]);

  // Evicted: a new instance with the same sockets.
  const woken = room(state);
  create(woken, pub, 1, 'hello');
  await vi.waitFor(() =>
    expect(pub.sent).toContainEqual({
      id: 1,
      type: 'result',
      body: { json: { title: 'hello' } },
    }),
  );
  const eventId = (events(sub, 1)[0] as { eventId: string }).eventId;
  expect(events(sub, 1)).toEqual([
    {
      id: 1,
      type: 'event',
      body: { json: { id: eventId, data: { title: 'hello' } } },
      eventId,
    },
  ]);

  // Abort: the subscription leaves the attachment.
  say(woken, sub, { type: 'abort', id: 1 });
  expect(sub.deserializeAttachment()).not.toHaveProperty('subs');
  create(woken, pub, 2, 'again');
  await vi.waitFor(() => expect(pub.sent).toHaveLength(2));
  expect(events(sub, 1)).toHaveLength(1);
});

test('a hibernated subscription replays kept events after lastEventId', async () => {
  const state = fakeState();
  const sockets = room(state);
  const pub = new FakeSocket();
  sockets.accept(pub, request);
  create(sockets, pub, 1, 'one');
  create(sockets, pub, 2, 'two');
  await vi.waitFor(() => expect(pub.sent).toHaveLength(2));

  const sub = new FakeSocket();
  sockets.accept(sub, request);
  say(sockets, sub, {
    id: 1,
    type: 'request',
    method: 'subscription',
    path: 'onCreated',
    lastEventId: '0',
  });
  await vi.waitFor(() => expect(events(sub, 1)).toHaveLength(2));
  expect(
    events(sub, 1).map(
      (e) => (e as { body: { json: { data: unknown } } }).body.json.data,
    ),
  ).toEqual([{ title: 'one' }, { title: 'two' }]);
  expect(sub.deserializeAttachment()).toHaveProperty('subs');
  expect(sub.sent.some((m) => (m as { type: string }).type === 'done')).toBe(
    false,
  );
});

test('an event the subscription rejects ends it with an error', async () => {
  const state = fakeState();
  const sockets = room(state);
  const sub = new FakeSocket();
  sockets.accept(sub, request);
  say(sockets, sub, {
    id: 1,
    type: 'request',
    method: 'subscription',
    path: 'onCreated',
  });
  await vi.waitFor(() =>
    expect(sub.deserializeAttachment()).toHaveProperty('subs'),
  );
  create(sockets, sub, 2, 'far too long a title');
  await vi.waitFor(() =>
    expect(events(sub, 1)).toEqual([
      expect.objectContaining({ id: 1, type: 'error' }),
    ]),
  );
  expect(sub.deserializeAttachment()).not.toHaveProperty('subs');
});

const RoomToken = connectionToken(Schema.Struct({ user: Schema.String }), {
  secret: 'test-secret',
  ttlSeconds: 60,
});

class Notes extends Publisher.Service<
  Notes,
  { [inbox: `inbox:${string}`]: { text: string } }
>()('test/Notes') {}

const nt = initTrpc<{ ctx: { user: string } }>();

const notesRoom = (state: ReturnType<typeof fakeState>) =>
  experimental_createHibernatingWebSockets(
    createFetchHandler({
      router: {
        send: nt.procedure
          .input(z.object({ to: z.string(), text: z.string() }))
          .mutation(({ input }) =>
            Effect.as(
              Notes.publish(`inbox:${input.to}`, { text: input.text }),
              'sent',
            ),
          ),
        inbox: nt.procedure.subscription(({ ctx, lastEventId }) =>
          Notes.subscribe(`inbox:${ctx.user}`, { lastEventId }),
        ),
      },
      createContext: ({ info }) =>
        Effect.runPromise(RoomToken.verify(info.connectionParams?.['token'])),
      layer: hibernatingPublisher(Notes, { state, buffer: 10 }),
    }),
    { state },
  );

const join = async (sockets: ReturnType<typeof notesRoom>, user: string) => {
  const socket = new FakeSocket();
  sockets.accept(socket, request);
  const token = await Effect.runPromise(RoomToken.sign({ user }));
  say(sockets, socket, {
    type: 'init',
    version: '12',
    connectionParams: { token },
  });
  return socket;
};

test('a signed token picks the channel a hibernated subscription gets events for', async () => {
  const state = fakeState();
  const sockets = notesRoom(state);
  const ada = await join(sockets, 'ada');
  const bob = await join(sockets, 'bob');
  for (const socket of [ada, bob]) {
    say(sockets, socket, {
      id: 1,
      type: 'request',
      method: 'subscription',
      path: 'inbox',
    });
  }
  await vi.waitFor(() => {
    expect(ada.deserializeAttachment()).toMatchObject({
      subs: [{ c: 1, ch: 'inbox:ada' }],
    });
    expect(bob.deserializeAttachment()).toMatchObject({
      subs: [{ c: 1, ch: 'inbox:bob' }],
    });
  });

  // Evicted: the channels come back from the attachments.
  const woken = notesRoom(state);
  const send = (id: number, to: string, text: string) =>
    say(woken, bob, {
      id,
      type: 'request',
      method: 'mutation',
      path: 'send',
      input: jsonSerializer.serialize({ to, text }),
    });
  send(2, 'ada', 'hi ada');
  send(3, 'bob', 'hi bob');
  await vi.waitFor(() =>
    expect(
      bob.sent.filter((m) => (m as { type: string }).type === 'result'),
    ).toHaveLength(2),
  );
  const texts = (socket: FakeSocket) =>
    events(socket, 1).map(
      (e) =>
        (e as { body: { json: { data: { text: string } } } }).body.json.data
          .text,
    );
  expect(texts(ada)).toEqual(['hi ada']);
  expect(texts(bob)).toEqual(['hi bob']);
});

test('nothing is sent to a socket that is closing: not results, not events', async () => {
  const state = fakeState();
  state.getWebSockets = function () {
    return this.accepted;
  };
  const sockets = notesRoom(state);
  const ada = await join(sockets, 'ada');
  const bob = await join(sockets, 'bob');
  say(sockets, ada, {
    id: 1,
    type: 'request',
    method: 'subscription',
    path: 'inbox',
  });
  await vi.waitFor(() =>
    expect(ada.deserializeAttachment()).toMatchObject({
      subs: [{ c: 1, ch: 'inbox:ada' }],
    }),
  );
  const before = ada.sent.length;
  ada.readyState = 2;
  say(sockets, ada, {
    id: 2,
    type: 'request',
    method: 'mutation',
    path: 'send',
    input: jsonSerializer.serialize({ to: 'bob', text: 'unsent' }),
  });
  say(sockets, bob, {
    id: 1,
    type: 'request',
    method: 'mutation',
    path: 'send',
    input: jsonSerializer.serialize({ to: 'ada', text: 'unseen' }),
  });
  await vi.waitFor(() =>
    expect(bob.sent).toContainEqual(
      expect.objectContaining({ id: 1, type: 'result' }),
    ),
  );
  await new Promise((r) => setTimeout(r, 20));
  expect(ada.sent).toHaveLength(before);
});

test('an init with a protocol version the server does not speak closes the socket', () => {
  const socket = new FakeSocket();
  const sockets = notesRoom(fakeState());
  sockets.accept(socket, request);
  say(sockets, socket, { type: 'init', version: '11' });
  expect(socket.closed).toEqual([1002, 'Unsupported protocol version']);
});

test('connection tokens fail with UNAUTHORIZED when missing, tampered with or expired', async () => {
  const token = await Effect.runPromise(RoomToken.sign({ user: 'ada' }));
  expect(await Effect.runPromise(RoomToken.verify(token))).toEqual({
    user: 'ada',
  });

  const [body, mac] = token.split('.');
  const forged = `${btoa(JSON.stringify({ c: '{"user":"eve"}', exp: Date.now() + 1e6 })).replace(/=+$/, '')}.${mac}`;
  for (const [bad, message] of [
    [undefined, 'Missing connection token'],
    ['nope', 'Malformed connection token'],
    [`.${mac}`, 'Malformed connection token'],
    [forged, 'Invalid connection token'],
    [`${body}.${mac}x`, 'Invalid connection token'],
  ] as const) {
    const exit = await Effect.runPromiseExit(RoomToken.verify(bad));
    expect(exit).toMatchObject({
      _tag: 'Failure',
      cause: { reasons: [{ error: { code: 'UNAUTHORIZED', message } }] },
    });
  }

  const expired = await Effect.runPromise(
    Effect.gen(function* () {
      const minted = yield* RoomToken.sign({ user: 'ada' });
      yield* TestClock.adjust('61 seconds');
      return yield* Effect.flip(RoomToken.verify(minted));
    }).pipe(Effect.provide(TestClock.layer())),
  );
  expect(expired).toMatchObject({
    code: 'UNAUTHORIZED',
    message: 'Expired connection token',
  });

  const rejected = new FakeSocket();
  const sockets = notesRoom(fakeState());
  sockets.accept(rejected, request);
  say(sockets, rejected, {
    type: 'init',
    version: '12',
    connectionParams: { token: forged },
  });
  say(sockets, rejected, {
    id: 1,
    type: 'request',
    method: 'subscription',
    path: 'inbox',
  });
  await vi.waitFor(() =>
    expect(rejected.sent).toEqual([
      { type: 'init', serializer: 'json' },
      expect.objectContaining({ id: 1, type: 'error' }),
    ]),
  );
});

test('a Redacted secret, the default ttl of an hour, and claims an older schema signed', async () => {
  const secret = Redacted.make('test-secret');
  const V2 = connectionToken(Schema.Struct({ user: Schema.Number }), {
    secret,
  });
  const [verified, expired, oldClaims, malformed] = await Effect.runPromise(
    Effect.gen(function* () {
      const minted = yield* V2.sign({ user: 1 });
      yield* TestClock.adjust('59 minutes');
      const verified = yield* V2.verify(minted);
      yield* TestClock.adjust('2 minutes');
      const expired = yield* Effect.flip(V2.verify(minted));
      const old = yield* RoomToken.sign({ user: 'ada' });
      const oldClaims = yield* Effect.flip(V2.verify(old));
      const malformed = yield* Effect.flip(
        V2.verify(`!!!.${old.split('.')[1]}`),
      );
      return [verified, expired, oldClaims, malformed] as const;
    }).pipe(Effect.provide(TestClock.layer())),
  );
  expect(verified).toEqual({ user: 1 });
  expect(expired).toMatchObject({ message: 'Expired connection token' });
  expect(oldClaims).toMatchObject({
    code: 'UNAUTHORIZED',
    message: 'Invalid connection token claims',
  });
  expect(malformed).toMatchObject({ message: 'Malformed connection token' });
});

test('a handler not from createFetchHandler, and upgrade() outside Workers, are refused', () => {
  expect(() =>
    experimental_createHibernatingWebSockets({ fetch: () => {} } as never, {
      state: fakeState(),
    }),
  ).toThrow('needs a handler from createFetchHandler');
  const sockets = experimental_createHibernatingWebSockets(handler, {
    state: fakeState(),
  });
  expect(() => sockets.upgrade(request, platform)).toThrow(
    'upgrade() needs WebSocketPair',
  );
});

test('a request URL or connection params past the 2 KB limit are dropped with a warning', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const long = new FakeSocket();
  const sockets = experimental_createHibernatingWebSockets(handler, {
    state: fakeState(),
  });
  sockets.accept(
    long,
    new Request(`https://room.example/trpc?${'q'.repeat(2100)}`),
    platform,
  );
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('request URL passes'),
  );

  const socket = new FakeSocket();
  sockets.accept(socket, request, platform);
  send(sockets, socket, {
    type: 'init',
    version: '12',
    connectionParams: { token: 'x'.repeat(2100) },
  });
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("connection params pass Cloudflare's 2 KB"),
  );
  expect(socket.deserializeAttachment()).toMatchObject({
    headers: [],
    connectionParams: undefined,
  });
  send(sockets, socket, {
    id: 1,
    type: 'request',
    method: 'query',
    path: 'whoami',
  });
  await vi.waitFor(() =>
    expect(socket.sent).toContainEqual(
      expect.objectContaining({ id: 1, type: 'result' }),
    ),
  );
});

test('closing reports 1006 as 1000, and tolerates a socket already closed', () => {
  const socket = new FakeSocket();
  const sockets = experimental_createHibernatingWebSockets(handler, {
    state: fakeState(),
  });
  sockets.accept(socket, request, platform);
  sockets.close(socket, 1006, 'gone');
  expect(socket.closed).toEqual([1000, 'gone']);
  socket.close = () => {
    throw new Error('already closed');
  };
  expect(() => sockets.close(socket, 4000, 'again')).not.toThrow();
});

test('many hibernated subscriptions: the ones past the limit stay awake; aborts remove only theirs', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const state = fakeState();
  const sockets = room(state);
  const sub = new FakeSocket();
  sockets.accept(sub, request);
  for (let id = 1; id <= 40; id++) {
    say(sockets, sub, {
      id,
      type: 'request',
      method: 'subscription',
      path: 'onCreated',
    });
  }
  await vi.waitFor(() =>
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("doesn't fit the socket's 2 KB attachment"),
    ),
  );
  const parked = () =>
    (sub.deserializeAttachment() as { subs: Array<{ c: number }> }).subs.map(
      (s) => s.c,
    );
  const before = parked();
  expect(before.length).toBeGreaterThan(1);
  expect(before.length).toBeLessThan(40);

  say(sockets, sub, { type: 'abort', id: before[0]! });
  say(sockets, sub, { type: 'abort', id: 40 });
  expect(parked()).toEqual(before.slice(1));

  const pub = new FakeSocket();
  sockets.accept(pub, request);
  create(sockets, pub, 1, 'hi');
  await vi.waitFor(() => expect(events(sub, before[1]!)).toHaveLength(1));
  await vi.waitFor(() => expect(events(sub, 39)).toHaveLength(1));
  sockets.close(sub, 1000, '');
});

test('events skip parked paths the router lacks, and states without getWebSockets', async () => {
  const state = fakeState();
  const sockets = room(state);
  const stale = new FakeSocket();
  sockets.accept(stale, request);
  stale.serializeAttachment({
    ...(stale.deserializeAttachment() as object),
    subs: [{ c: 7, k: 'test/HibernatingPosts', ch: 'created', p: 'removed' }],
  });
  const pub = new FakeSocket();
  sockets.accept(pub, request);
  create(sockets, pub, 1, 'hi');
  await vi.waitFor(() => expect(pub.sent).toHaveLength(1));
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(stale.sent).toEqual([]);

  const bare = Object.assign(fakeState(), { getWebSockets: undefined });
  const alone = room(bare as never);
  const socket = new FakeSocket();
  alone.accept(socket, request);
  create(alone, socket, 1, 'solo');
  await vi.waitFor(() =>
    expect(socket.sent).toContainEqual(
      expect.objectContaining({ id: 1, type: 'result' }),
    ),
  );
});
