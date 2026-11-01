import { Duration, Effect, Redacted, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import {
  experimental_connectionToken,
  experimental_createHibernatingWebSockets,
  experimental_hibernatingPublisher,
  type HibernatableWebSocket,
} from '@trpc12/trpc/cloudflare';
import { cors } from '@trpc12/trpc/http';
import {
  createFetchHandler,
  initTrpc,
  lazy,
  experimental_Publisher,
  type AnyRouter,
} from '@trpc12/trpc/server';
import { jsonTransformer } from '@trpc12/trpc/transformer';
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
const router = t.router({
  whoami: t.procedure.query((opts) => opts.ctx),
  double: t.procedure
    .input(z.object({ n: z.number() }))
    .query((opts) => opts.input.n * 2),
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
});

const handler = createFetchHandler<typeof router, { env: Env }>({
  router,
  createContext: (opts) => ({
    token: opts.info.connectionParams?.['token'] as string | undefined,
    cookie: opts.request.headers['cookie'] ?? null,
    other: opts.request.headers['x-other'] ?? null,
    region: opts.platform?.env.region,
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
    input: jsonTransformer.serialize({ n: 21 }),
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

test('dispose() ends the running subscriptions, closes the sockets with 1012, and takes none after', async () => {
  const pairs = stubWorkers();
  const state = fakeState();
  const socket = new FakeSocket();
  const idle = new FakeSocket();
  const sockets = experimental_createHibernatingWebSockets(handler, { state });
  sockets.accept(socket, request, platform);
  sockets.accept(idle, request, platform);
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

  const other = new FakeSocket();
  state.accepted.push(other);
  const gone = new FakeSocket();
  sockets.accept(gone, request, platform);
  gone.close = () => {
    throw new TypeError('already closed');
  };

  const disposing = sockets.dispose();
  expect(sockets[Symbol.asyncDispose]()).toBe(disposing);
  await disposing;
  await vi.waitFor(() => expect(ticksStopped).toBe(before + 1));
  expect(socket.closed).toEqual([1012, 'Service restart']);
  expect(idle.closed).toEqual([1012, 'Service restart']);
  expect(other.closed).toBeUndefined();
  await experimental_createHibernatingWebSockets(handler, {
    state: Object.assign(fakeState(), { getWebSockets: undefined }),
  }).dispose();

  const late = new FakeSocket();
  sockets.accept(late, request, platform);
  expect(late.closed).toEqual([1012, 'Service restart']);
  const woken = new FakeSocket();
  woken.serializeAttachment(socket.deserializeAttachment());
  send(sockets, woken, { type: 'ping' });
  expect(woken.closed).toEqual([1012, 'Service restart']);
  expect((await sockets.upgrade(request, platform)).status).toBe(503);
  expect(pairs).toEqual([]);
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

/** Node's `Response` refuses the 101 with a `webSocket` that Workers send. */
class WorkersResponse extends Response {
  readonly webSocket: unknown;
  constructor(
    body?: BodyInit | null,
    init?: ResponseInit & { webSocket?: unknown },
  ) {
    super(body, init?.status === 101 ? { ...init, status: 200 } : init);
    this.webSocket = init?.webSocket;
  }
  override get status() {
    return this.webSocket ? 101 : super.status;
  }
}

/** Workers' `WebSocketPair` and `Response`; `pairs` lists each pair made. */
const stubWorkers = () => {
  const pairs: [FakeSocket, FakeSocket][] = [];
  vi.stubGlobal(
    'WebSocketPair',
    class {
      0 = new FakeSocket();
      1 = new FakeSocket();
      constructor() {
        pairs.push([this[0], this[1]]);
      }
    },
  );
  vi.stubGlobal('Response', WorkersResponse);
  return pairs;
};

test('upgrade() accepts one end of a WebSocketPair and returns the other', async () => {
  const pairs = stubWorkers();
  const state = fakeState();
  const sockets = experimental_createHibernatingWebSockets(handler, { state });
  const res = (await sockets.upgrade(request, platform)) as WorkersResponse;
  const [client, server] = pairs[0]!;
  expect(res.status).toBe(101);
  expect(res.webSocket).toBe(client);
  expect(state.accepted).toEqual([server]);
});

test("upgrade() runs the handler's middleware: cors() refuses another origin with a 403 before a socket exists", async () => {
  const guarded = createFetchHandler<typeof router, { env: Env }>({
    router,
    createContext: () => ({
      token: undefined,
      cookie: null,
      other: null,
      region: undefined,
    }),
    middleware: [cors({ allowedOrigins: ['https://app.example'] })],
  });
  const pairs = stubWorkers();
  const state = fakeState();
  const sockets = experimental_createHibernatingWebSockets(guarded, { state });
  const from = (origin: string) =>
    new Request(request, { headers: { upgrade: 'websocket', origin } });

  const refused = await sockets.upgrade(from('https://evil.example'), platform);
  expect(refused.status).toBe(403);
  expect(pairs).toEqual([]);
  expect(state.accepted).toEqual([]);

  const allowed = (await sockets.upgrade(
    from('https://app.example'),
    platform,
  )) as WorkersResponse;
  expect(allowed.status).toBe(101);
  expect(allowed.headers.get('access-control-allow-origin')).toBe(
    'https://app.example',
  );
  expect(state.accepted).toEqual([pairs[0]![1]]);

  // Non-browser clients send no origin and pass.
  const plain = await sockets.upgrade(request, platform);
  expect(plain.status).toBe(101);
  expect(state.accepted).toHaveLength(2);
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

class Posts extends experimental_Publisher.Service<
  Posts,
  { created: { title: string } }
>()('test/HibernatingPosts') {}

const pt = initTrpc();

/** A Durable Object instance: what its constructor builds. */
const room = (state: ReturnType<typeof fakeState>) => {
  const h = createFetchHandler({
    router: pt.router({
      create: pt.procedure
        .input(z.object({ title: z.string() }))
        .mutation((opts) =>
          Effect.as(Posts.publish('created', opts.input), opts.input),
        ),
      onCreated: pt.procedure
        .output(z.object({ title: z.string().max(10) }))
        .subscription((opts) =>
          Posts.subscribe('created', { lastEventId: opts.lastEventId }),
        ),
    }),
    layer: experimental_hibernatingPublisher(Posts, { state, buffer: 10 }),
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
    input: jsonTransformer.serialize({ title }),
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

test('disposing an adapter leaves the newer one on the same object sending publisher events', async () => {
  const state = fakeState();
  let current!: ReturnType<typeof room>;
  {
    await using old = room(state);
    current = room(state);
    expect(old).not.toBe(current);
  }
  const sub = new FakeSocket();
  const pub = new FakeSocket();
  current.accept(sub, request);
  current.accept(pub, request);
  say(current, sub, {
    id: 1,
    type: 'request',
    method: 'subscription',
    path: 'onCreated',
  });
  await vi.waitFor(() =>
    expect(sub.deserializeAttachment()).toHaveProperty('subs'),
  );
  create(current, pub, 1, 'hello');
  await vi.waitFor(() => expect(events(sub, 1)).toHaveLength(1));
  expect(sub.closed).toBeUndefined();
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

test('a lazy subtree that fails to load after a wake ends its hibernated subscriptions with an error', async () => {
  const lazyRoom = (
    state: ReturnType<typeof fakeState>,
    load: () => Promise<AnyRouter>,
  ) =>
    experimental_createHibernatingWebSockets(
      createFetchHandler({
        router: pt.router({
          create: pt.procedure
            .input(z.object({ title: z.string() }))
            .mutation((opts) =>
              Effect.as(Posts.publish('created', opts.input), opts.input),
            ),
          live: lazy(load),
        }),
        layer: experimental_hibernatingPublisher(Posts, { state, buffer: 10 }),
      }),
      { state },
    );
  const live = {
    onCreated: pt.procedure.subscription((opts) =>
      Posts.subscribe('created', { lastEventId: opts.lastEventId }),
    ),
  } satisfies AnyRouter;
  const state = fakeState();
  const sockets = lazyRoom(state, async () => live);
  const sub = new FakeSocket();
  const pub = new FakeSocket();
  sockets.accept(sub, request);
  sockets.accept(pub, request);
  say(sockets, sub, {
    id: 1,
    type: 'request',
    method: 'subscription',
    path: 'live.onCreated',
  });
  await vi.waitFor(() =>
    expect(sub.deserializeAttachment()).toHaveProperty('subs'),
  );

  const woken = lazyRoom(state, () => Promise.reject(new Error('gone')));
  create(woken, pub, 1, 'hello');
  await vi.waitFor(() =>
    expect(events(sub, 1)).toEqual([
      expect.objectContaining({ id: 1, type: 'error' }),
    ]),
  );
  expect(sub.deserializeAttachment()).not.toHaveProperty('subs');
});

const RoomToken = experimental_connectionToken(
  Schema.Struct({ user: Schema.String }),
  {
    secret: 'test-secret',
    ttl: '60 seconds',
  },
);

class Notes extends experimental_Publisher.Service<
  Notes,
  { [inbox: `inbox:${string}`]: { text: string } }
>()('test/Notes') {}

const nt = initTrpc<{ ctx: { user: string } }>();

const notesRoom = (state: ReturnType<typeof fakeState>) =>
  experimental_createHibernatingWebSockets(
    createFetchHandler({
      router: nt.router({
        send: nt.procedure
          .input(z.object({ to: z.string(), text: z.string() }))
          .mutation((opts) =>
            Effect.as(
              Notes.publish(`inbox:${opts.input.to}`, {
                text: opts.input.text,
              }),
              'sent',
            ),
          ),
        inbox: nt.procedure.subscription((opts) =>
          Notes.subscribe(`inbox:${opts.ctx.user}`, {
            lastEventId: opts.lastEventId,
          }),
        ),
      }),
      createContext: (opts) =>
        Effect.runPromise(
          RoomToken.verify(opts.info.connectionParams?.['token']),
        ),
      layer: experimental_hibernatingPublisher(Notes, { state, buffer: 10 }),
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
      input: jsonTransformer.serialize({ to, text }),
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
    input: jsonTransformer.serialize({ to: 'bob', text: 'unsent' }),
  });
  say(sockets, bob, {
    id: 1,
    type: 'request',
    method: 'mutation',
    path: 'send',
    input: jsonTransformer.serialize({ to: 'ada', text: 'unseen' }),
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
      { type: 'init', transformer: 'json' },
      expect.objectContaining({ id: 1, type: 'error' }),
    ]),
  );
});

test('a Redacted secret, the default ttl of an hour, and claims an older schema signed', async () => {
  const secret = Redacted.make('test-secret');
  const V2 = experimental_connectionToken(
    Schema.Struct({ user: Schema.Number }),
    {
      secret,
    },
  );
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

test.each([
  ['milliseconds', 90_000],
  ['a Duration', Duration.minutes(1.5)],
] as const)('a token ttl in %s', async (_, ttl) => {
  const token = experimental_connectionToken(
    Schema.Struct({ user: Schema.String }),
    { secret: 'test-secret', ttl },
  );
  const [verified, expired] = await Effect.runPromise(
    Effect.gen(function* () {
      const minted = yield* token.sign({ user: 'ada' });
      yield* TestClock.adjust('89 seconds');
      const verified = yield* token.verify(minted);
      yield* TestClock.adjust('2 seconds');
      return [verified, yield* Effect.flip(token.verify(minted))] as const;
    }).pipe(Effect.provide(TestClock.layer())),
  );
  expect(verified).toEqual({ user: 'ada' });
  expect(expired).toMatchObject({ message: 'Expired connection token' });
});

test('a handler not from createFetchHandler, and upgrade() outside Workers, are refused', async () => {
  expect(() =>
    experimental_createHibernatingWebSockets({ fetch: () => {} } as never, {
      state: fakeState(),
    }),
  ).toThrow('needs a handler from createFetchHandler');
  const sockets = experimental_createHibernatingWebSockets(handler, {
    state: fakeState(),
  });
  await expect(sockets.upgrade(request, platform)).rejects.toThrow(
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
