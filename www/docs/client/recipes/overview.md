---
title: Recipes Overview
sidebar_label: Overview
---

Recipes are for integration patterns where tRPC gives you low-level primitives, but we don't maintain an official integration package.

You can think of these pages as "bring your own framework" guides: copy the boilerplate, adapt it to your runtime, and keep the same type-safe router contract.

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

## In this section

- [Making your own client](./making-your-own-client.md)
- [Integrating with AI SDK](./integrating-with-ai-sdk.md)
- [Integrating with TanStack Start](./integrating-with-tanstack-start.md)
- [Writing your own link](./writing-your-own-link.md)
- [Microservices + SOA](./microservices-soa.md)
- [Authentication and authorization using middleware](./authentication-and-authorization-using-middleware.md)
