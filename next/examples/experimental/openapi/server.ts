/**
 * One router served over RPC (`/trpc`) and REST (`/api`), with an OpenAPI
 * document generated from its types (inferred errors included) and a Scalar UI
 * at `/api/docs`.
 */
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpServer, HttpServerRequest } from 'effect/http';
import { toHttpEffect } from '@trpc12/trpc/http';
import {
  experimental_createOpenApiHandler,
  experimental_openApiReference,
} from '@trpc12/trpc/openapi';
import { experimental_generateOpenApiFromTypes } from '@trpc12/trpc/openapi/typescript';
import { createFetchHandler } from '@trpc12/trpc/server';
import { appRouter } from './router.ts';

export type { AppRouter } from './router.ts';

const createContext = (opts: {
  request: { headers: Record<string, string | undefined> };
}) => ({ user: opts.request.headers['x-user'] ?? null });

export async function listen(port = 0) {
  // Usually a build step.
  const document = await experimental_generateOpenApiFromTypes(appRouter, {
    file: new URL('./router.ts', import.meta.url),
    tsconfig: new URL('./tsconfig.json', import.meta.url),
    info: { title: 'Posts API', version: '1.0.0' },
  });
  const rpc = createFetchHandler({ router: appRouter, createContext });
  const rest = experimental_createOpenApiHandler({
    router: appRouter,
    createContext,
    middleware: [experimental_openApiReference({ document })],
  });
  const rpcApp = toHttpEffect(rpc);
  const restApp = toHttpEffect(rest);

  const runtime = ManagedRuntime.make(
    HttpServer.serve(
      Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
        request.url.startsWith('/trpc') ? rpcApp : restApp,
      ),
    ).pipe(
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
      await Promise.all([rpc.dispose(), rest.dispose()]);
    },
  };
}

if (import.meta.main) {
  const server = await listen(Number(process.env['PORT'] ?? 3000));
  console.log(
    `tRPC at ${server.url}, REST docs at ${new URL(server.url).origin}/api/docs`,
  );
}
