/**
 * The same handler on three servers: Effect's own, Express 5 and Fastify.
 * Each also answers `GET /health` outside tRPC.
 */
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Exit, Layer, ManagedRuntime, Scope } from 'effect';
import { HttpRouter, HttpServer, HttpServerResponse } from 'effect/http';
import express from 'express';
import Fastify from 'fastify';
import { toHttpEffect } from '@trpc12/trpc/http';
import type { ApiHandler } from './handler.ts';

export interface Listening {
  readonly name: string;
  /** `http://127.0.0.1:<port>`; tRPC is at `/trpc`. */
  readonly origin: string;
  close(): Promise<void>;
}

/** The Effect way: the handler's routes merged with our own. */
export async function listenEffect(
  handler: ApiHandler,
  port = 0,
): Promise<Listening> {
  const app = Layer.mergeAll(
    handler.routes,
    HttpRouter.add('GET', '/health', HttpServerResponse.text('ok')),
  );
  const runtime = ManagedRuntime.make(
    HttpRouter.serve(app, { disableLogger: true, disableListenLog: true }).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port, host: '127.0.0.1' }),
      ),
    ),
  );
  const origin = await runtime.runPromise(
    HttpServer.addressFormattedWith(Effect.succeed),
  );
  return { name: 'effect', origin, close: () => runtime.dispose() };
}

/** `(req, res)` for Express, Fastify or `node:http`, living in `scope`. */
const nodeHandlerFor = (handler: ApiHandler, scope: Scope.Closeable) =>
  Effect.runPromise(
    NodeHttpServer.makeHandler(toHttpEffect(handler), { scope }),
  );

async function listening(server: Server) {
  if (!server.listening) await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

export async function listenExpress(
  handler: ApiHandler,
  port = 0,
): Promise<Listening> {
  const scope = Scope.makeUnsafe();
  const nodeHandler = await nodeHandlerFor(handler, scope);
  const app = express();
  app.get('/health', (_req, res) => {
    res.type('text').send('ok');
  });
  // Body parsers may run first: the handler reads `req.body` when they did.
  app.use(express.json());
  // A route, not `app.use('/trpc', …)`, which strips the prefix from req.url.
  app.all('/trpc{/*path}', nodeHandler);
  const server = app.listen(port, '127.0.0.1');
  const origin = await listening(server);
  return {
    name: 'express',
    origin,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await Effect.runPromise(Scope.close(scope, Exit.void));
    },
  };
}

export async function listenFastify(
  handler: ApiHandler,
  port = 0,
): Promise<Listening> {
  const scope = Scope.makeUnsafe();
  const nodeHandler = await nodeHandlerFor(handler, scope);
  const fastify = Fastify();
  fastify.get('/health', () => 'ok');
  await fastify.register(async (scoped) => {
    // The handler reads the raw body itself, so Fastify must not parse it.
    scoped.removeAllContentTypeParsers();
    scoped.addContentTypeParser('*', (_req, _payload, done) => done(null));
    // Batches go to `/trpc` itself, which `/trpc/*` doesn't match.
    for (const path of ['/trpc', '/trpc/*']) {
      scoped.all(path, (req, reply) => {
        reply.hijack();
        nodeHandler(req.raw, reply.raw);
      });
    }
  });
  await fastify.listen({ port, host: '127.0.0.1' });
  return {
    name: 'fastify',
    origin: await listening(fastify.server),
    close: async () => {
      await fastify.close();
      await Effect.runPromise(Scope.close(scope, Exit.void));
    },
  };
}
