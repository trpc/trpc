---
name: adapter-fastify
description: >
  Mount tRPC as a Fastify plugin with fastifyTRPCPlugin from
  @trpc/server/adapters/fastify. Configure prefix, trpcOptions (router,
  createContext, onError). Enable WebSocket subscriptions with useWSS and
  @fastify/websocket. Set routerOptions.maxParamLength for batch requests.
  Requires Fastify v5+. FastifyTRPCPluginOptions for type-safe onError.
  CreateFastifyContextOptions provides req, res.
type: core
library: trpc
library_version: '11.16.0'
requires:
  - server-setup
sources:
  - www/docs/server/adapters/fastify.md
  - examples/fastify-server/
---

# tRPC — Adapter: Fastify

## Setup

```ts
// server.ts
import { initTRPC } from '@trpc/server';
import {
  fastifyTRPCPlugin,
  FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import fastify from 'fastify';
import { z } from 'zod';

function createContext({ req, res }: CreateFastifyContextOptions) {
  return { req, res };
}
type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

const appRouter = t.router({
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => ({ greeting: `Hello, ${input.name}!` })),
});

export type AppRouter = typeof appRouter;

const server = fastify({
  routerOptions: {
    maxParamLength: 5000,
  },
});

server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error }) {
      console.error(`Error in tRPC handler on path '${path}':`, error);
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
});

(async () => {
  try {
    await server.listen({ port: 3000 });
    console.log('Listening on http://localhost:3000');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
})();
```

## Core Patterns

### WebSocket subscriptions with @fastify/websocket

```ts
import ws from '@fastify/websocket';
import {
  fastifyTRPCPlugin,
  FastifyTRPCPluginOptions,
} from '@trpc/server/adapters/fastify';
import fastify from 'fastify';
import { createContext } from './context';
import { appRouter, type AppRouter } from './router';

const server = fastify({
  routerOptions: { maxParamLength: 5000 },
});

// Register @fastify/websocket BEFORE the tRPC plugin
server.register(ws);

server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  useWSS: true,
  trpcOptions: {
    router: appRouter,
    createContext,
    keepAlive: {
      enabled: true,
      pingMs: 30000,
      pongWaitMs: 5000,
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
});

server.listen({ port: 3000 });
```

Install: `npm install @fastify/websocket` (minimum version 3.11.0)

### Type-safe onError with satisfies

```ts
server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext,
    onError({ path, error, type, input }) {
      console.error(`[${type}] ${path}:`, error.message);
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
});
```

Due to Fastify plugin type inference limitations, use `satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions']` to get correct types on `onError` and other callbacks.

### Limiting batch size with maxBatchSize

```ts
server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: {
    router: appRouter,
    createContext,
    maxBatchSize: 10,
  } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
});
```

Requests batching more than `maxBatchSize` operations are rejected with a `400 Bad Request` error. Set `maxItems` on your client's `httpBatchLink` to the same value to avoid exceeding the limit.

## Common Mistakes

### HIGH Registering @fastify/websocket after tRPC plugin

Wrong:

```ts
server.register(fastifyTRPCPlugin, {
  useWSS: true,
  trpcOptions: { router: appRouter, createContext },
});
server.register(ws); // too late!
```

Correct:

```ts
server.register(ws); // register FIRST
server.register(fastifyTRPCPlugin, {
  useWSS: true,
  trpcOptions: { router: appRouter, createContext },
});
```

The WebSocket plugin must be registered before the tRPC plugin. Reverse order causes WebSocket routes to not be recognized.

Source: www/docs/server/adapters/fastify.md

### HIGH Missing maxParamLength for batch requests

Wrong:

```ts
const server = fastify();
```

Correct:

```ts
const server = fastify({
  routerOptions: { maxParamLength: 5000 },
});
```

Fastify defaults to `maxParamLength: 100`. Batch requests from `httpBatchLink` encode multiple procedure names in the URL path parameter, which easily exceeds 100 characters and returns a 404.

Source: www/docs/server/adapters/fastify.md

### CRITICAL Using Fastify v4 with tRPC v11

Wrong:

```json
{ "dependencies": { "fastify": "^4.0.0" } }
```

Correct:

```json
{ "dependencies": { "fastify": "^5.0.0" } }
```

tRPC v11 requires Fastify v5+. Fastify v4 may return empty responses without errors due to incompatible response handling.

Source: www/docs/server/adapters/fastify.md

## See Also

- **server-setup** -- `initTRPC.create()`, router/procedure definition, context
- **subscriptions** -- async generator subscriptions, `tracked()`, `keepAlive`
- **adapter-standalone** -- simpler adapter when Fastify features are not needed
- Fastify docs: https://fastify.dev/docs/latest/
