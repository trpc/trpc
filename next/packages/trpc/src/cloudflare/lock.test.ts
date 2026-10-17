import { Effect, Exit, Fiber, type Layer } from 'effect';
import {
  experimental_durableLocker,
  experimental_durableLockObject,
  type DurableLockNamespace,
  type DurableLockObject,
  type DurableLockSocket,
  type HibernatableWebSocket,
} from '@trpc12/trpc/cloudflare';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import {
  experimental_lock,
  experimental_Locker,
} from '@trpc12/trpc/middleware';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';

const OPEN = 1;
const CLOSED = 3;

/**
 * The Workers runtime, as far as a lock object sees it: a WebSocketPair
 * whose server end hibernates with an attachment, and `webSocketClose`
 * when the client end goes away.
 */
class ServerEnd implements HibernatableWebSocket {
  readyState = OPEN;
  peer!: ClientEnd;
  onClose: (() => void) | undefined;
  #attachment: unknown = null;
  send(data: string) {
    if (this.readyState === OPEN) this.peer.emit('message', data);
  }
  close(_code?: number, _reason?: string) {
    if (this.readyState !== OPEN) throw new TypeError('WebSocket is closed');
    this.readyState = CLOSED;
    this.peer.drop();
  }
  serializeAttachment(value: unknown) {
    this.#attachment = structuredClone(value);
  }
  deserializeAttachment() {
    return structuredClone(this.#attachment);
  }
}

class ClientEnd implements DurableLockSocket {
  readyState = OPEN;
  accepted = false;
  peer!: ServerEnd;
  #listeners = new Map<string, Array<() => void>>();
  accept() {
    this.accepted = true;
  }
  addEventListener(type: string, fn: () => void) {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), fn]);
  }
  emit(type: string, _data?: string) {
    for (const fn of this.#listeners.get(type) ?? []) fn();
  }
  drop() {
    if (this.readyState !== OPEN) return;
    this.readyState = CLOSED;
    this.emit('close');
  }
  close() {
    if (this.readyState !== OPEN) return;
    this.readyState = CLOSED;
    this.peer.readyState = CLOSED;
    queueMicrotask(() => this.peer.onClose?.());
  }
}

class WebSocketPair {
  0: ClientEnd;
  1: ServerEnd;
  constructor() {
    this[0] = new ClientEnd();
    this[1] = new ServerEnd();
    this[0].peer = this[1];
    this[1].peer = this[0];
  }
}

/** Workers' Response, which takes a 101 and a `webSocket`. */
class UpgradeResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly webSocket: unknown;
  constructor(
    _body: null,
    init: { status: number; headers?: HeadersInit; webSocket?: unknown },
  ) {
    this.status = init.status;
    this.headers = new Headers(init.headers);
    this.webSocket = init.webSocket;
  }
}

/** One lock object per name, with the state Durable Objects keep. */
function namespace() {
  const objects = new Map<
    string,
    { object: DurableLockObject; sockets: ServerEnd[] }
  >();
  const names: string[] = [];
  const ns: DurableLockNamespace = {
    getByName(name) {
      names.push(name);
      let entry = objects.get(name);
      if (!entry) {
        const sockets: ServerEnd[] = [];
        const object = experimental_durableLockObject({
          acceptWebSocket(socket: never) {
            const end = socket as ServerEnd;
            end.onClose = () => object.close(end);
            sockets.push(end);
          },
          getWebSockets: () => [...sockets].reverse(),
        });
        objects.set(name, (entry = { object, sockets }));
      }
      const object = entry.object;
      return {
        fetch: async (input, init) => {
          const native = globalThis.Response;
          globalThis.Response = UpgradeResponse as never;
          try {
            return object.fetch(new Request(input, init)) as never;
          } finally {
            globalThis.Response = native;
          }
        },
      };
    },
  };
  return { ns, names, objects };
}

const t = initTrpc();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function app(layer: Layer.Layer<experimental_Locker>, log: string[]) {
  const work = 30;
  const byKey = experimental_lock<{ input: { key: string } }>({
    key: (opts) => opts.input.key,
    timeout: '1 second',
  });
  const router = {
    hold: t.procedure
      .input(z.object({ key: z.string(), by: z.string() }))
      .use(byKey)
      .mutation(async (opts) => {
        log.push(`start ${opts.input.by}`);
        await sleep(work);
        log.push(`end ${opts.input.by}`);
        return opts.ctx.lock.waited;
      }),
  };
  const handler = createFetchHandler({ router, layer });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({
        url: 'https://worker.example/trpc',
        fetch: (input, init) =>
          handler.fetch(new Request(input as string, init as RequestInit)),
      }),
    ],
  });
  return { client, handler };
}

test('two Worker instances share one lock through the object, waiters told in turn', async () => {
  vi.stubGlobal('WebSocketPair', WebSocketPair);
  const durable = namespace();
  const layer = experimental_durableLocker(durable.ns, { prefix: 'locks:' });
  const log: string[] = [];
  const one = app(layer, log);
  const two = app(layer, log);
  const [a, b, c] = await Promise.all([
    one.client.hold.mutate({ key: 'seat-1', by: 'a' }),
    sleep(5).then(() => two.client.hold.mutate({ key: 'seat-1', by: 'b' })),
    sleep(10).then(() => one.client.hold.mutate({ key: 'seat-1', by: 'c' })),
  ]);
  expect([a, b, c].filter((waited) => !waited)).toHaveLength(1);
  expect(log).toHaveLength(6);
  for (let i = 0; i < log.length; i += 2) {
    expect(log[i + 1]).toBe(log[i]!.replace('start', 'end'));
  }
  expect(new Set(durable.names)).toEqual(new Set(['locks:seat-1']));
  const sockets = durable.objects.get('locks:seat-1')!.sockets;
  expect(sockets.map((s) => s.readyState)).toEqual([CLOSED, CLOSED, CLOSED]);
  expect(sockets.map((s) => s.deserializeAttachment())).toEqual([
    { lock: 'released' },
    { lock: 'released' },
    { lock: 'released' },
  ]);
  await Promise.all([one.handler.dispose(), two.handler.dispose()]);
});

test('a waiter that times out leaves the line; the next one gets the lock', async () => {
  vi.stubGlobal('WebSocketPair', WebSocketPair);
  const durable = namespace();
  const layer = experimental_durableLocker(durable.ns, {
    timeout: '20 millis',
  });
  const program = Effect.gen(function* () {
    const locker = yield* experimental_Locker;
    const holder = yield* Effect.forkChild(
      Effect.scoped(
        Effect.andThen(locker.acquire('k'), Effect.sleep('60 millis')),
      ),
    );
    yield* Effect.sleep('5 millis');
    const impatient = yield* Effect.exit(Effect.scoped(locker.acquire('k')));
    const patient = yield* Effect.scoped(
      locker.acquire('k', { timeout: '1 second' }),
    );
    yield* Fiber.join(holder);
    return { impatient, patient };
  });
  const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
  expect(Exit.isFailure(result.impatient)).toBe(true);
  expect(String(result.impatient)).toContain('LockTimeout');
  expect(result.patient).toEqual({ waited: true });
  expect(
    durable.objects.get('k')!.sockets.map((s) => s.deserializeAttachment()),
  ).toEqual([{ lock: 'released' }, { lock: 'waiter' }, { lock: 'released' }]);
});

test('a holder past its ttl loses the lock to the waiter', async () => {
  vi.stubGlobal('WebSocketPair', WebSocketPair);
  const durable = namespace();
  const layer = experimental_durableLocker(durable.ns, { ttl: '20 millis' });
  const program = Effect.gen(function* () {
    const locker = yield* experimental_Locker;
    const started = Date.now();
    const holder = yield* Effect.forkChild(
      Effect.scoped(
        Effect.andThen(locker.acquire('k'), Effect.sleep('200 millis')),
      ),
    );
    yield* Effect.sleep('5 millis');
    const waiter = yield* Effect.scoped(locker.acquire('k'));
    const waitedMs = Date.now() - started;
    yield* Fiber.join(holder);
    return { waiter, waitedMs };
  });
  const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
  expect(result.waiter).toEqual({ waited: true });
  expect(result.waitedMs).toBeLessThan(150);
});

test('a waiter whose socket the object drops dies; a closed socket closes quietly', async () => {
  vi.stubGlobal('WebSocketPair', WebSocketPair);
  const durable = namespace();
  const layer = experimental_durableLocker(durable.ns);
  const program = Effect.gen(function* () {
    const locker = yield* experimental_Locker;
    yield* Effect.forkChild(
      Effect.scoped(
        Effect.andThen(locker.acquire('k'), Effect.sleep('50 millis')),
      ),
    );
    yield* Effect.sleep('5 millis');
    const waiting = yield* Effect.forkChild(
      Effect.exit(Effect.scoped(locker.acquire('k'))),
    );
    yield* Effect.sleep('5 millis');
    const entry = durable.objects.get('k')!;
    const waiter = entry.sockets[1]!;
    waiter.close(1011, 'evicted');
    entry.object.close(waiter);
    return yield* Fiber.join(waiting);
  });
  const exit = await Effect.runPromise(program.pipe(Effect.provide(layer)));
  expect(String(exit)).toContain('The lock object closed the socket');
});

test('an object outside Workers, or one that refuses the upgrade, is an error', async () => {
  const outside = experimental_durableLockObject({
    acceptWebSocket() {},
    getWebSockets: () => [],
  });
  expect(() => outside.fetch(new Request('https://lock/acquire'))).toThrow(
    'durable locks need WebSocketPair (Workers)',
  );

  const refusing = experimental_durableLocker({
    getByName: () => ({
      fetch: async () => ({ status: 503, headers: new Headers() }),
    }),
  });
  const exit = await Effect.runPromise(
    Effect.exit(
      Effect.scoped(
        Effect.gen(function* () {
          const locker = yield* experimental_Locker;
          return yield* locker.acquire('k');
        }),
      ),
    ).pipe(Effect.provide(refusing)),
  );
  expect(String(exit)).toContain('The lock object answered 503');
});
