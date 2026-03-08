---
title: Recipes Overview
sidebar_label: Overview
---

Recipes are for integration patterns where tRPC gives you low-level primitives, but we don't maintain an official integration package.

You can think of these pages as "bring your own framework" guides: copy the boilerplate, adapt it to your runtime, and keep the same type-safe router contract.

## What a recipe is (and is not)

A recipe is:

- A documented pattern that uses stable tRPC primitives
- A good starting point for production integration work
- Maintained by documentation and examples, not by a dedicated framework package

A recipe is not:

- A drop-in package with framework-specific lifecycle behavior implemented for you
- A guarantee that every edge case in your stack is handled automatically
- A replacement for reading the relevant core docs (links, middleware, adapters, context)

## When to use Recipes

Use a recipe when:

1. You need to integrate tRPC into a stack we don't publish an official package for.
2. You still want end-to-end types between server procedures and client calls.
3. You are willing to own the integration layer in your application.

If we publish an official integration for your stack, prefer that package first.

```ts twoslash
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

export const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
});
```

## Production checklist

Before shipping a recipe-based integration, make sure you have:

- **Authentication strategy**: where identity is injected (`createContext`) and validated (middleware)
- **Error mapping**: predictable translation from `TRPCError` to your app UI/logging format
- **Transport decisions**: HTTP batching vs streaming vs websocket based on workload
- **Observability**: tracing/logging in links and/or middleware
- **Testing strategy**: at least one integration test that crosses network boundaries
- **Operational constraints**: timeouts, retries, abort handling, and backpressure where relevant

## In this section

- [Making your own client](./making-your-own-client.md)
- [Integrating with AI SDK](./integrating-with-ai-sdk.md)
- [Integrating with TanStack Start](./integrating-with-tanstack-start.md)
- [Writing your own link](./writing-your-own-link.md)
- [Microservices + SOA](./microservices-soa.md)
- [Authentication and authorization using middleware](./authentication-and-authorization-using-middleware.md)

## Related core docs

- [Vanilla client](../vanilla/overview.md)
- [Links overview](../links/overview.md)
- [Middlewares](../../server/middlewares.md)
- [Adapters](/docs/server/adapters)
