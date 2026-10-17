/**
 * OpenAPI example: one router served over RPC (`/trpc`) and REST (`/api`),
 * an OpenAPI document generated from its types (inferred errors included),
 * served with a Scalar UI, then called with `fetch` and with `openApiLink`.
 * Run with `node index.ts`.
 */
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpServer, HttpServerRequest } from 'effect/http';
import { createTrpcClient, safe } from '@trpc12/trpc/client';
import { toContract } from '@trpc12/trpc/contract';
import { toHttpEffect } from '@trpc12/trpc/http';
import {
  createOpenApiHandler,
  openApiLink,
  openApiReference,
} from '@trpc12/trpc/openapi';
import { experimental_generateOpenApiFromTypes } from '@trpc12/trpc/openapi/typescript';
import { createFetchHandler } from '@trpc12/trpc/server';
import { appRouter } from './router.ts';

// --- the document, usually a build step ----------------------------------------------

const document = await experimental_generateOpenApiFromTypes(appRouter, {
  file: new URL('./router.ts', import.meta.url),
  tsconfig: new URL('./tsconfig.json', import.meta.url),
  info: { title: 'Posts API', version: '1.0.0' },
});
const byIdResponses = Object.keys(
  document.paths['/api/posts/{id}']!['get']!.responses,
);
console.log('GET /api/posts/{id} documents', byIdResponses.join(', '));
if (!byIdResponses.includes('404'))
  throw new Error('the inferred 404 is missing');

// --- server --------------------------------------------------------------------------

const createContext = (opts: {
  request: { headers: Record<string, string | undefined> };
}) => ({ user: opts.request.headers['x-user'] ?? null });

const rpc = createFetchHandler({ router: appRouter, createContext });
const rest = createOpenApiHandler({
  router: appRouter,
  createContext,
  middleware: [openApiReference({ document })],
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
      NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
    ),
  ),
);
const url = await runtime.runPromise(
  HttpServer.addressFormattedWith((address) => Effect.succeed(address)),
);
console.log(`docs at ${url}/api/docs`);

// --- REST with fetch -----------------------------------------------------------------

const list = await fetch(`${url}/api/posts?limit=5`);
console.log('GET /api/posts', list.status, await list.json());

const missing = await fetch(`${url}/api/posts/404`);
console.log('GET /api/posts/404', missing.status, await missing.json());

const created = await fetch(`${url}/api/posts`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-user': 'ada' },
  body: JSON.stringify({ title: 'From fetch' }),
});
console.log('POST /api/posts', created.status, await created.json());

const spec = await fetch(`${url}/api/openapi.json`);
console.log('GET /api/openapi.json', spec.status);

// --- REST with the typed client ------------------------------------------------------

const contract = toContract(appRouter);
const client = createTrpcClient({
  router: contract,
  links: [openApiLink({ url, contract, headers: { 'x-user': 'ada' } })],
});

const post = await client.post.create.mutate({ title: 'From openApiLink' });
console.log('openApiLink post.create', post.id, post.createdAt);

const [, err] = await safe(client.post.byId.query({ id: '404' }));
console.log('openApiLink post.byId', err?.code);
if (err?.code !== 'NOT_FOUND') throw new Error('expected NOT_FOUND');

await runtime.dispose();
await Promise.all([rpc.dispose(), rest.dispose()]);
