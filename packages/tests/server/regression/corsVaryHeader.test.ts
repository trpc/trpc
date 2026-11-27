// @vitest-environment node
import type { AddressInfo } from 'net';
import { initTRPC } from '@trpc/server';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';
import fastify from 'fastify';

// `cors()` and `@fastify/cors` echo an allowed origin back and add
// `Vary: Origin`, so that a cache keeps one response per origin

const t = initTRPC.create();

const router = t.router({
  hello: t.procedure.query(() => 'world'),
});

async function startStandaloneServer() {
  const server = createHTTPServer({
    router,
    middleware: (req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '');
      res.setHeader('Vary', 'Origin');
      next();
    },
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  return makeAsyncResource({ url: `http://localhost:${port}` }, () => {
    return new Promise<void>((resolve, reject) =>
      server.close((err) => {
        err ? reject(err) : resolve();
      }),
    );
  });
}

async function startFastifyServer() {
  const instance = fastify();
  instance.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', req.headers.origin ?? '');
    reply.header('Vary', 'Origin');
  });
  instance.register(fastifyTRPCPlugin, { trpcOptions: { router } });
  const url = await instance.listen({ port: 0 });

  return makeAsyncResource({ url }, () => instance.close());
}

test('the standalone adapter keeps the Vary header a middleware set', async () => {
  await using $ = await startStandaloneServer();

  const res = await fetch(`${$.url}/hello`, {
    headers: { origin: 'https://a.example.com' },
  });

  expect(res.status).toBe(200);
  expect(res.headers.get('access-control-allow-origin')).toBe(
    'https://a.example.com',
  );
  expect(res.headers.get('vary')).toBe('Origin, trpc-accept, accept');
});

test('the Fastify adapter keeps the Vary header a hook set', async () => {
  await using $ = await startFastifyServer();

  const res = await fetch(`${$.url}/hello`, {
    headers: { origin: 'https://a.example.com' },
  });

  expect(res.status).toBe(200);
  expect(res.headers.get('access-control-allow-origin')).toBe(
    'https://a.example.com',
  );
  expect(res.headers.get('vary')).toBe('Origin, trpc-accept, accept');
});
