# `@trpc12/trpc`

The core of tRPC v12, in one package split into entry points. Write procedures on the server, serve them with one handler on any runtime, and call them from a client typed by the router.

```sh
pnpm add @trpc12/trpc effect
```

`effect` is a peer dependency, so the app and `@trpc12/trpc` share one copy; code that uses Promises never imports it. `.input()` takes any Standard Schema (zod, Valibot, ArkType, …) or an Effect Schema: the example uses zod (`pnpm add zod`).

```ts
// server.ts
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

const t = initTrpc();

export const appRouter = t.router({
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query((opts) => `Hello, ${opts.input.name}`),
});
export type AppRouter = typeof appRouter;

export const handler = createFetchHandler({ router: appRouter });
// handler.fetch(request) on any fetch runtime

// client.ts
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
const greeting = await client.greet.query({ name: 'tRPC' }); // string
```

## Entry points

| Entry                             | For                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `@trpc12/trpc/server`             | `initTrpc`, routers, handlers, callers, `experimental_Publisher`                                    |
| `@trpc12/trpc/client`             | `createTrpcClient`, links, `safe`                                                                   |
| `@trpc12/trpc/middleware`         | lifecycle hooks, `experimental_rateLimit`, locks, durable calls                                     |
| `@trpc12/trpc/effect`             | `createEffectClient`                                                                                |
| `@trpc12/trpc/contract`           | contract-first routers, `experimental_toContract`                                                   |
| `@trpc12/trpc/transformer`        | `jsonTransformer`, `createSyncTransformer`, progressive JSON (`experimental_createProgressiveJson`) |
| `@trpc12/trpc/http`               | `serve`, `toHttpEffect` on Effect's `HttpServer`                                                    |
| `@trpc12/trpc/cloudflare`         | Durable Objects and Workers Traces                                                                  |
| `@trpc12/trpc/aws-lambda`         | `toLambdaHandler`                                                                                   |
| `@trpc12/trpc/socket`             | `experimental_serveSocket` over TCP, TLS or Unix sockets                                            |
| `@trpc12/trpc/openapi`            | REST routes, OpenAPI documents, `experimental_openApiLink`                                          |
| `@trpc12/trpc/openapi/typescript` | an OpenAPI document from the router's types                                                         |
| `@trpc12/trpc/mcp`                | procedures as MCP tools, `experimental_createMcpHandler`                                            |
| `@trpc12/trpc/actions`            | procedures as React Server Actions                                                                  |
| `@trpc12/trpc/interop`            | `createV11Handler`, `fromV11Link` for v11 code                                                      |
| `@trpc12/trpc/extend`             | building blocks for integrations                                                                    |

Each one's docs are listed in [Packages and stability](https://v12.trpc.io/v12/docs/packages#trpc12trpc-entry-points).

## Docs

- [Getting started](https://v12.trpc.io/v12/docs/getting-started)
- [The server](https://v12.trpc.io/v12/docs/server/overview)
- [The client](https://v12.trpc.io/v12/docs/client/overview)
- [Links](https://v12.trpc.io/v12/docs/client/links)
- [Subscriptions](https://v12.trpc.io/v12/docs/subscriptions/overview)
- [Adapters](https://v12.trpc.io/v12/docs/adapters/overview)
- [OpenAPI](https://v12.trpc.io/v12/docs/openapi/overview)
- [Packages and stability](https://v12.trpc.io/v12/docs/packages)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://v12.trpc.io/v12/docs/packages#stability)).
