---
title: Integrating with TanStack Start
sidebar_label: Integrating with TanStack Start
---

TanStack Start can call any Fetch-compatible handler. Use tRPC's Fetch adapter on the server, then create a normal client in your Start app.

```ts twoslash
// @filename: server.ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();
const appRouter = t.router({});
export type AppRouter = typeof appRouter;

export function trpcHandler(request: Request) {
  return fetchRequestHandler({
    endpoint: '/trpc',
    req: request,
    router: appRouter,
    createContext: () => ({}),
  });
}

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/trpc' })],
});
```

Mount `trpcHandler` in your Start server route (`/trpc`) and use `trpc` in loaders/actions/components.
