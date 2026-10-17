import { NodeRedis } from '@effect/platform-node';
import { Duration, Effect, Fiber, Layer } from 'effect';
import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import {
  experimental_lock,
  experimental_LockConflict,
  experimental_Locker,
  experimental_memoryLocker,
  experimental_redisLocker,
} from '@trpc12/trpc/middleware';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from '../fixtures/server.ts';

const t = initTrpc();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeRouter(opts: {
  work: number;
  timeout?: Duration.Input;
  ttl?: Duration.Input;
}) {
  const log: string[] = [];
  const starts = new Map<
    string,
    { promise: Promise<void>; resolve: () => void }
  >();
  const start = (by: string) => {
    let s = starts.get(by);
    if (!s) {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => (resolve = r));
      starts.set(by, (s = { promise, resolve }));
    }
    return s;
  };
  /** Resolves once `by`'s resolver runs, so it holds the lock. */
  const started = (by: string) => start(by).promise;
  const byInvoice = experimental_lock<{ input: { invoice: string } }>({
    key: (args) => `invoice:${args.input.invoice}`,
    timeout: opts.timeout ?? '5 seconds',
    ...(opts.ttl && { ttl: opts.ttl }),
  });
  return {
    log,
    router: {
      pay: t.procedure
        .input(z.object({ invoice: z.string(), by: z.string() }))
        .use(byInvoice)
        .mutation(async (args) => {
          const { input } = args;
          log.push(`start ${input.by}`);
          start(input.by).resolve();
          await sleep(opts.work);
          log.push(`end ${input.by}`);
          return { by: input.by, waited: args.ctx.lock.waited };
        }),
      twice: t.procedure
        .input(z.object({ invoice: z.string(), by: z.string() }))
        .use(byInvoice)
        .use(byInvoice)
        .mutation((args) => args.ctx.lock.waited),
    },
    started,
  };
}

async function serve(
  router: ReturnType<typeof makeRouter>['router'],
  layer: Layer.Layer<experimental_Locker, unknown>,
) {
  const http = await createTestServer({ router, layer });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: http.url })],
  });
  return { http, client };
}

test('calls with the same key run one at a time; others run alongside', async () => {
  const app = makeRouter({ work: 40 });
  const { log } = app;
  const server = await serve(app.router, experimental_memoryLocker());
  const { client } = server;
  await using _ = server.http;
  const [a, b, c] = await Promise.all([
    client.pay.mutate({ invoice: '1', by: 'a' }),
    app.started('a').then(() => client.pay.mutate({ invoice: '1', by: 'b' })),
    app.started('a').then(() => client.pay.mutate({ invoice: '2', by: 'c' })),
  ]);
  expect(a).toEqual({ by: 'a', waited: false });
  expect(b).toEqual({ by: 'b', waited: true });
  expect(c).toEqual({ by: 'c', waited: false });
  expect(log.indexOf('start b')).toBeGreaterThan(log.indexOf('end a'));
  expect(log.indexOf('start c')).toBeLessThan(log.indexOf('end a'));
});

test('a lock still held after timeout fails the call with a typed CONFLICT', async () => {
  const app = makeRouter({ work: 100, timeout: '20 millis' });
  const server = await serve(app.router, experimental_memoryLocker());
  await using _ = server.http;
  const first = server.client.pay.mutate({ invoice: '1', by: 'a' });
  await app.started('a');
  const [, err] = await safe(
    server.client.pay.mutate({ invoice: '1', by: 'b' }),
  );
  expect(err).toMatchObject({ code: 'CONFLICT', defined: true });
  if (err?.defined)
    expectTypeOf(err.code).toEqualTypeOf<'BAD_REQUEST' | 'CONFLICT'>();
  expect(await first).toEqual({ by: 'a', waited: false });
  expect(experimental_LockConflict.status).toBe(409);
});

test('a key the call already holds is not taken again', async () => {
  const app = makeRouter({ work: 0, timeout: '50 millis' });
  const server = await serve(app.router, experimental_memoryLocker());
  await using _ = server.http;
  expect(await server.client.twice.mutate({ invoice: '1', by: 'a' })).toBe(
    false,
  );
});

test('a holder that outlives ttl loses the lock', async () => {
  const app = makeRouter({ work: 80, ttl: '20 millis' });
  const server = await serve(app.router, experimental_memoryLocker());
  await using _ = server.http;
  const t0 = Date.now();
  await Promise.all([
    server.client.pay.mutate({ invoice: '1', by: 'a' }),
    app
      .started('a')
      .then(() => server.client.pay.mutate({ invoice: '1', by: 'b' })),
  ]);
  expect(Date.now() - t0).toBeLessThan(150);
});

test('an aborted waiter gives up its place in line', async () => {
  const layer = experimental_memoryLocker();
  const program = Effect.gen(function* () {
    const locker = yield* experimental_Locker;
    const order: string[] = [];
    const hold = (name: string, ms: number) =>
      Effect.scoped(
        Effect.gen(function* () {
          yield* locker.acquire('k');
          order.push(name);
          yield* Effect.sleep(ms);
        }),
      );
    const a = yield* Effect.forkChild(hold('a', 30));
    yield* Effect.sleep(5);
    const b = yield* Effect.forkChild(hold('b', 0));
    yield* Effect.sleep(5);
    const c = yield* Effect.forkChild(hold('c', 0));
    yield* Effect.sleep(5);
    yield* Fiber.interrupt(b);
    yield* Fiber.join(a);
    yield* Fiber.join(c);
    return order;
  });
  expect(await Effect.runPromise(program.pipe(Effect.provide(layer)))).toEqual([
    'a',
    'c',
  ]);
});

test('the handler must provide experimental_Locker', () => {
  const app = makeRouter({ work: 0 });
  expectTypeOf<
    Parameters<typeof createFetchHandler<typeof app.router>>[0]['layer']
  >().toEqualTypeOf<Layer.Layer<experimental_Locker, any, never>>();
  // @ts-expect-error -- experimental_Locker is required
  createFetchHandler({ router: app.router });
});

const redisUrl = process.env['REDIS_URL'];

test.skipIf(!redisUrl)(
  'two servers sharing Redis hold one lock between them',
  async () => {
    const app = makeRouter({ work: 40 });
    const layer = experimental_redisLocker({
      prefix: `test:lock:${Date.now()}:`,
      retryInterval: '5 millis',
    }).pipe(Layer.provide(NodeRedis.layer({ url: redisUrl! })));
    const one = await serve(app.router, layer);
    const two = await serve(app.router, layer);
    await using _1 = one.http;
    await using _2 = two.http;
    const [a, b] = await Promise.all([
      one.client.pay.mutate({ invoice: '1', by: 'a' }),
      app
        .started('a')
        .then(() => two.client.pay.mutate({ invoice: '1', by: 'b' })),
    ]);
    expect(a.waited).toBe(false);
    expect(b.waited).toBe(true);
    expect(app.log.indexOf('start b')).toBeGreaterThan(
      app.log.indexOf('end a'),
    );
  },
);

test.skipIf(!redisUrl)(
  'a Redis lock held past timeout fails the other call with CONFLICT',
  async () => {
    const app = makeRouter({
      work: 300,
      timeout: '50 millis',
    });
    const layer = experimental_redisLocker().pipe(
      Layer.provide(NodeRedis.layer({ url: redisUrl! })),
    );
    const one = await serve(app.router, layer);
    const two = await serve(app.router, layer);
    await using _1 = one.http;
    await using _2 = two.http;
    const invoice = `timeout-${Date.now()}`;
    const first = one.client.pay.mutate({ invoice, by: 'a' });
    await app.started('a');
    const [, err] = await safe(two.client.pay.mutate({ invoice, by: 'b' }));
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect(await first).toEqual({ by: 'a', waited: false });
  },
);
