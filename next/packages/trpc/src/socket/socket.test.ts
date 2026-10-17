import { connect, createServer, type AddressInfo } from 'node:net';
import { NodeSocket, NodeSocketServer } from '@effect/platform-node';
import { Context, Effect, Exit, Layer, Scope } from 'effect';
import { SocketServer } from 'effect/socket';
import {
  createTrpcClient,
  safe,
  experimental_socketLink,
  routerType,
} from '@trpc12/trpc/client';
import {
  createFetchHandler,
  error,
  initTrpc,
  tracked,
  type CreateContextOpts,
} from '@trpc12/trpc/server';
import { serveSocket } from '@trpc12/trpc/socket';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc<{ ctx: { user: string | null; transport: string } }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const state = { aborted: 0, infos: [] as CreateContextOpts['info'][] };

const router = {
  hello: t.procedure
    .input(z.object({ name: z.string() }))
    .query((opts) => `hello ${opts.input.name} over ${opts.ctx.transport}`),
  whoami: t.procedure.query((opts) => opts.ctx.user),
  find: t.procedure
    .input(z.object({ id: z.string() }))
    .query((opts) =>
      opts.input.id === '1'
        ? { id: '1', at: new Date(0) }
        : error({ code: 'NOT_FOUND', data: { id: opts.input.id } }),
    ),
  report: t.procedure.query(() => ({
    title: 'Report',
    total: (async () => {
      await sleep(10);
      return 42;
    })(),
  })),
  slow: t.procedure.query(
    (opts) =>
      new Promise<string>((resolve) => {
        const timer = setTimeout(() => resolve('late'), 5000);
        opts.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          state.aborted++;
          resolve('aborted');
        });
      }),
  ),
  ticks: t.procedure
    .input(z.object({ lastEventId: z.string().optional() }).optional())
    .subscription(async function* (opts) {
      for (let n = Number(opts.input?.lastEventId ?? -1) + 1; n < 3; n++) {
        yield tracked(String(n), n);
      }
    }),
};

async function serve(opts: { idleTimeoutMs?: number | false } = {}) {
  const scope = Scope.makeUnsafe();
  const handler = createFetchHandler({
    router,
    createContext: ({ info }) => {
      state.infos.push(info);
      return {
        user: (info.connectionParams?.['user'] as string | undefined) ?? null,
        transport: info.transport,
      };
    },
  });
  const server = Context.get(
    await Effect.runPromise(
      Layer.buildWithScope(
        serveSocket(handler, opts).pipe(
          Layer.provideMerge(
            NodeSocketServer.layer({ port: 0, host: '127.0.0.1' }),
          ),
        ),
        scope,
      ),
    ),
    SocketServer.SocketServer,
  );
  const port = (server.address as { port: number }).port;
  return {
    port,
    socket: NodeSocket.makeNet({ host: '127.0.0.1', port }),
    [Symbol.asyncDispose]: () =>
      Effect.runPromise(Scope.close(scope, Exit.void)),
  };
}

test('queries, deferred values and errors over TCP', async () => {
  await using server = await serve();
  await using link = experimental_socketLink({
    socket: server.socket,
    connectionParams: { user: 'ada' },
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });

  expect(await client.hello.query({ name: 'tcp' })).toBe(
    'hello tcp over socket',
  );
  expect(await client.whoami.query()).toBe('ada');
  expect(await client.find.query({ id: '1' })).toEqual({
    id: '1',
    at: new Date(0).toJSON(),
  });
  const [, err] = await safe(client.find.query({ id: '2' }));
  expect(err).toMatchObject({ code: 'NOT_FOUND', data: { id: '2' } });
  const report = await client.report.query();
  expect(report.title).toBe('Report');
  expect(await report.total).toBe(42);
  expect(state.infos.at(-1)?.transport).toBe('socket');
});

test('aborting a call aborts it on the server', async () => {
  await using server = await serve();
  await using link = experimental_socketLink({ socket: server.socket });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  const before = state.aborted;
  const controller = new AbortController();
  const pending = safe(
    client.slow.query(undefined, { signal: controller.signal }),
  );
  await sleep(30);
  controller.abort();
  const [, err] = await pending;
  expect(err).toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  await vi.waitFor(() => expect(state.aborted).toBe(before + 1));
});

test('subscriptions stream tracked events', async () => {
  await using server = await serve();
  await using link = experimental_socketLink({ socket: server.socket });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  const events: number[] = [];
  for await (const event of client.ticks.subscribe()) {
    events.push(event.data);
  }
  expect(events).toEqual([0, 1, 2]);
});

test('a dropped connection reconnects for the next call', async () => {
  await using server = await serve({ idleTimeoutMs: 50 });
  await using link = experimental_socketLink({
    socket: server.socket,
    keepAlive: false,
    reconnect: { attempts: 3, delayMs: () => 10 },
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  expect(await client.whoami.query()).toBe(null);
  await sleep(120);
  expect(await client.hello.query({ name: 'again' })).toBe(
    'hello again over socket',
  );
});

test('a line that is not JSON gets a PARSE_ERROR message', async () => {
  await using server = await serve();
  const reply = await new Promise<string>((resolve, reject) => {
    const raw = connect(server.port, '127.0.0.1', () => raw.write('nope\n'));
    raw.setEncoding('utf8');
    raw.once('data', (data: string) => {
      raw.destroy();
      resolve(data);
    });
    raw.once('error', reject);
  });
  const message = JSON.parse(reply.split('\n')[0]!);
  expect(message).toMatchObject({ id: null, type: 'error' });
});

test('the link skips lines from the server that are not JSON', async () => {
  const server = createServer((raw) => {
    raw.setEncoding('utf8');
    let buffered = '';
    raw.on('data', (data: string) => {
      buffered += data;
      for (
        let end = buffered.indexOf('\n');
        end !== -1;
        end = buffered.indexOf('\n')
      ) {
        const message = JSON.parse(buffered.slice(0, end));
        buffered = buffered.slice(end + 1);
        if (message.type !== 'request') continue;
        const result = {
          id: message.id,
          type: 'result',
          body: { json: 'scripted' },
        };
        raw.write(`nope\n${JSON.stringify(result)}\n`);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  try {
    await using link = experimental_socketLink({
      socket: NodeSocket.makeNet({ host: '127.0.0.1', port: address.port }),
      keepAlive: false,
    });
    const client = createTrpcClient({
      router: routerType<typeof router>(),
      links: [link],
    });
    expect(await client.whoami.query()).toBe('scripted');
  } finally {
    server.close();
  }
});
