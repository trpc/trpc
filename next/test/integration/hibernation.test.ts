import {
  createFetchHandler,
  createHibernatingWebSockets,
  initTrpc,
  type HibernatableWebSocket,
} from 'trpcdev/server';
import { defaultSerializer } from 'trpcdev/serializer';
import { afterEach, expect, test, vi } from 'vite-plus/test';
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
    cookie: request.headers.get('cookie'),
    other: request.headers.get('x-other'),
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
  accepted: [] as unknown[],
  autoResponse: undefined as unknown,
  acceptWebSocket(socket: never) {
    this.accepted.push(socket);
  },
  setWebSocketAutoResponse(pair?: unknown) {
    this.autoResponse = pair;
  },
});

const request = new Request('https://room.example/trpc', {
  headers: { cookie: 'session=1', 'x-other': 'dropped', upgrade: 'websocket' },
});
const platform = { env: { region: 'weur' } };
const send = (
  sockets: ReturnType<typeof createHibernatingWebSockets<{ env: Env }>>,
  socket: FakeSocket,
  message: object,
) => sockets.message(socket, JSON.stringify(message), platform);

afterEach(() => {
  vi.unstubAllGlobals();
});

test('calls work, and still see the connection after the object wakes', async () => {
  const state = fakeState();
  const socket = new FakeSocket();
  const sockets = createHibernatingWebSockets(handler, { state });
  sockets.accept(socket, request, platform);
  expect(state.accepted).toEqual([socket]);

  send(sockets, socket, {
    type: 'init',
    version: '1',
    connectionParams: { token: 'kim' },
  });
  send(sockets, socket, {
    id: 1,
    type: 'request',
    method: 'query',
    path: 'double',
    input: defaultSerializer.serialize({ n: 21 }),
  });
  await vi.waitFor(() =>
    expect(socket.sent).toContainEqual({
      id: 1,
      type: 'result',
      body: { json: 42 },
    }),
  );

  // Evicted: a new object instance, the same socket and attachment.
  const woken = createHibernatingWebSockets(handler, { state: fakeState() });
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
  const sockets = createHibernatingWebSockets(handler, { state: fakeState() });
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
  createHibernatingWebSockets(handler, { state });
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
  const sockets = createHibernatingWebSockets(handler, { state });
  const res = sockets.upgrade(request, platform) as unknown as {
    init: { status: number; webSocket: unknown };
  };
  expect(res.init).toEqual({ status: 101, webSocket: client });
  expect(state.accepted).toEqual([server]);
});

test('a socket the adapter did not accept is closed', () => {
  const socket = new FakeSocket();
  const sockets = createHibernatingWebSockets(handler, { state: fakeState() });
  send(sockets, socket, { type: 'ping' });
  expect(socket.closed).toEqual([1011, 'Not a tRPC socket']);
});
