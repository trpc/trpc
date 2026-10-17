import { once } from 'node:events';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Exit, Scope } from 'effect';
import { HttpEffect } from 'effect/http';
import {
  createTrpcClient,
  httpLink,
  experimental_messagePortLink,
  routerType,
} from '@trpc12/trpc/client';
import { toHttpEffect } from '@trpc12/trpc/http';
import {
  createFetchHandler,
  initTrpc,
  type WebSocketLike,
} from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();
const router = {
  hello: t.procedure
    .input(z.object({ name: z.string() }))
    .query((opts) => `hello ${opts.input.name}`),
  save: t.procedure
    .input(z.object({ n: z.number() }))
    .mutation((opts) => opts.input.n * 2),
};
const handler = createFetchHandler({ router });

/** What `express.json()` does: read the stream, set `req.body`. */
async function jsonParser(req: IncomingMessage & { body?: unknown }) {
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', (chunk: string) => (raw += chunk));
  await once(req, 'end');
  if (req.headers['content-type']?.startsWith('application/json')) {
    req.body = JSON.parse(raw);
  }
}

test('a body an Express parser already read is taken from req.body', async () => {
  const scope = Scope.makeUnsafe();
  const nodeHandler = await Effect.runPromise(
    NodeHttpServer.makeHandler(toHttpEffect(handler), { scope }),
  );
  const server = createServer(async (req, res) => {
    await jsonParser(req);
    nodeHandler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}/trpc`;
  try {
    const client = createTrpcClient({
      router: routerType<typeof router>(),
      links: [httpLink({ url })],
    });
    expect(await client.save.mutate({ n: 2 })).toBe(4);

    const res = await fetch(`${url}/save`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x',
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      json: { error: { message: expect.stringMatching(/already read/) } },
    });
  } finally {
    server.closeAllConnections();
    server.close();
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
});

test('a (req, res) handler for Express, Fastify and node:http (docs/platforms.md)', async () => {
  const scope = Scope.makeUnsafe();
  const nodeHandler = await Effect.runPromise(
    NodeHttpServer.makeHandler(toHttpEffect(handler), { scope }),
  );
  // Effect reads req.url, which app.use('/trpc', …) strips; Express routes keep it.
  const server = createServer((req, res) => nodeHandler(req, res));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  try {
    const client = createTrpcClient({
      router: routerType<typeof router>(),
      links: [httpLink({ url: `http://127.0.0.1:${address.port}/trpc` })],
    });
    expect(await client.hello.query({ name: 'node' })).toBe('hello node');
  } finally {
    server.close();
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
});

test('a web handler from the Effect app, for fetch runtimes (docs/platforms.md)', async () => {
  const web = HttpEffect.toWebHandler(toHttpEffect(handler));
  const input = encodeURIComponent('{"name":"web"}');
  const res = await web(
    new Request(`http://localhost/trpc/hello?input=${input}`),
  );
  expect(await res.json()).toEqual({ json: 'hello web' });
});

test('platform values reach createContext, typed by the handler (docs/platforms.md)', async () => {
  interface Env {
    GREETING: string;
  }
  interface Platform {
    env: Env;
    ctx: { waitUntil(promise: Promise<unknown>): void };
  }
  const wt = initTrpc<{ ctx: { greeting: string; defer: Platform['ctx'] } }>();
  const workerRouter = {
    greet: wt.procedure.query((opts) => {
      opts.ctx.defer.waitUntil(Promise.resolve());
      return opts.ctx.greeting;
    }),
  };
  const worker = createFetchHandler<typeof workerRouter, Platform>({
    router: workerRouter,
    createContext: ({ platform }) => {
      expectTypeOf(platform).toEqualTypeOf<Platform>();
      return { greeting: platform.env.GREETING, defer: platform.ctx };
    },
  });
  const waited: Promise<unknown>[] = [];
  const platform: Platform = {
    env: { GREETING: 'hej' },
    ctx: { waitUntil: (p) => waited.push(p) },
  };
  const res = await worker.fetch(
    new Request('http://localhost/trpc/greet'),
    platform,
  );
  expect(await res.json()).toEqual({ json: 'hej' });
  expect(waited).toHaveLength(1);

  const channel = new MessageChannel();
  worker.messagePort(channel.port1, { platform });
  const client = createTrpcClient({
    router: routerType<typeof workerRouter>(),
    links: [experimental_messagePortLink({ port: channel.port2 })],
  });
  expect(await client.greet.query()).toBe('hej');
  channel.port1.close();
  channel.port2.close();

  void (() => {
    // @ts-expect-error -- the platform is required
    void worker.fetch(new Request('http://localhost/'));
    // @ts-expect-error -- and so is the upgrade's
    worker.websocket({} as WebSocketLike, { request: new Request('http://x') });
    // a handler without a platform type takes the request alone, as Next's route types expect
    expectTypeOf(handler.fetch).parameters.toEqualTypeOf<[request: Request]>();
  });
});
