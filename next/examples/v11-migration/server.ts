/**
 * The migrated server: the v12 router serves v12 clients on `/rpc` and the
 * apps still on `@trpc/client` 11 on `/trpc`, the endpoint they were built
 * with, until they update. `listen()` resolves to the v11 endpoint's URL;
 * v12 clients call `/rpc` beside it.
 */
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { toHttpEffect } from '@trpc12/trpc/http';
import { createV11Handler } from '@trpc12/trpc/interop';
import { createFetchHandler, type AnyTrpcError } from '@trpc12/trpc/server';
import superjson from 'superjson';
import { createContext } from './server/context.ts';
import { appRouter } from './server/router.ts';

export type { AppRouter } from './server/router.ts';
import { serializer } from './server/serializer.ts';

/** A failed input's issue messages, as the v11 errorFormatter sent them. */
const issueMessages = (error: AnyTrpcError): string[] | null => {
  const issues: unknown = error.data?.issues;
  return error.code === 'BAD_REQUEST' && Array.isArray(issues)
    ? issues.map((issue) => issue.message)
    : null;
};

export async function listen(port = 0) {
  const legacy = createV11Handler({
    router: appRouter,
    createContext,
    transformer: superjson,
    // The v11 router's errorFormatter, so old clients still read `data.issues`.
    errorFormatter: (opts) => ({
      ...opts.shape,
      data: {
        ...opts.shape.data,
        issues: issueMessages(opts.error),
      },
    }),
  });
  const handler = createFetchHandler({
    router: appRouter,
    createContext,
    endpoint: '/rpc',
    batch: true,
    serializer,
  });
  const routes = Layer.mergeAll(
    handler.routes,
    HttpRouter.add('*', '/trpc/*', toHttpEffect(legacy)),
  );
  const runtime = ManagedRuntime.make(
    HttpRouter.serve(routes, {
      disableLogger: true,
      disableListenLog: true,
    }).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port, host: '127.0.0.1' }),
      ),
    ),
  );
  const origin = await runtime.runPromise(
    HttpServer.addressFormattedWith((address) => Effect.succeed(address)),
  );
  return {
    url: `${origin}/trpc`,
    async [Symbol.asyncDispose]() {
      await runtime.dispose();
      await legacy.dispose();
      await handler.dispose();
    },
  };
}

if (import.meta.main) {
  const server = await listen(Number(process.env['PORT'] ?? 3000));
  console.log(
    `v11 clients: ${server.url}, v12 clients: ${new URL('/rpc', server.url).href}`,
  );
  process.once('SIGINT', () => void server[Symbol.asyncDispose]());
}
