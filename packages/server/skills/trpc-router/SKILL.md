---
name: trpc-router
description: >
  Entry point for all tRPC skills. Decision tree routing by task: initTRPC.create(),
  t.router(), t.procedure, createTRPCClient, adapters, subscriptions, React Query,
  Next.js, links, middleware, validators, error handling, caching, FormData.
type: core
library: trpc
library_version: '11.15.1'
requires: []
sources:
  - 'trpc/trpc:www/docs/main/introduction.mdx'
  - 'trpc/trpc:www/docs/main/quickstart.mdx'
---

# tRPC -- Skill Router

## Decision Tree

### What are you trying to do?

#### Define a tRPC backend (server)

- **Initialize tRPC, define routers, procedures, context, export AppRouter**
  -> Load skill: `server-setup`

- **Add middleware (.use), auth guards, logging, base procedures**
  -> Load skill: `middlewares`

- **Add input/output validation with Zod or other libraries**
  -> Load skill: `validators`

- **Throw typed errors, format errors for clients, global error handling**
  -> Load skill: `error-handling`

- **Call procedures from server code, write integration tests**
  -> Load skill: `server-side-calls`

- **Set Cache-Control headers on query responses (CDN, browser caching)**
  -> Load skill: `caching`

- **Accept FormData, File, Blob, or binary uploads in mutations**
  -> Load skill: `non-json-content-types`

- **Set up real-time subscriptions (SSE or WebSocket)**
  -> Load skill: `subscriptions`

#### Host the tRPC API (adapters)

- **Node.js built-in HTTP server (simplest, local dev)**
  -> Load skill: `adapter-standalone`

- **Express middleware**
  -> Load skill: `adapter-express`

- **Fastify plugin**
  -> Load skill: `adapter-fastify`

- **AWS Lambda (API Gateway v1/v2, Function URLs)**
  -> Load skill: `adapter-aws-lambda`

- **Fetch API / Edge (Cloudflare Workers, Deno, Vercel Edge, Astro, Remix)**
  -> Load skill: `adapter-fetch`

#### Consume the tRPC API (client)

- **Create a vanilla TypeScript client, configure links, headers, types**
  -> Load skill: `client-setup`

- **Configure link chain (batching, streaming, splitting, WebSocket, SSE)**
  -> Load skill: `links`

- **Use SuperJSON transformer for Date, Map, Set, BigInt**
  -> Load skill: `superjson`

#### Use tRPC with a framework

- **React with TanStack Query (useQuery, useMutation, queryOptions)**
  -> Load skill: `react-query-setup`

- **Next.js App Router (RSC, server components, HydrateClient)**
  -> Load skill: `nextjs-app-router`

- **Next.js Pages Router (withTRPC, SSR, SSG helpers)**
  -> Load skill: `nextjs-pages-router`

#### Advanced patterns

- **Generate OpenAPI spec, REST client from tRPC router**
  -> Load skill: `openapi`

- **Multi-service gateway, custom routing links, SOA**
  -> Load skill: `service-oriented-architecture`

- **Auth middleware + client headers + subscription auth**
  -> Load skill: `auth`

## Quick Reference: Minimal Working App

```ts
// server/trpc.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

```ts
// server/appRouter.ts
import { z } from 'zod';
import { publicProcedure, router } from './trpc';

export const appRouter = router({
  hello: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => ({ greeting: `Hello ${input.name}` })),
});

export type AppRouter = typeof appRouter;
```

```ts
// server/index.ts
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './appRouter';

const server = createHTTPServer({ router: appRouter });
server.listen(3000);
```

```ts
// client/index.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/appRouter';

const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000' })],
});

const result = await trpc.hello.query({ name: 'World' });
```

## See Also

- `server-setup` -- full server initialization details
- `client-setup` -- full client configuration
- `adapter-standalone` -- simplest adapter for getting started
- `react-query-setup` -- React integration
- `nextjs-app-router` -- Next.js App Router integration
