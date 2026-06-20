---
title: Integrating with TanStack Start
sidebar_label: Integrating with TanStack Start
---

TanStack Start can call any Fetch-compatible handler. Use tRPC's Fetch adapter on the server, then create a normal client in your Start app.

This integration works well because both sides speak Fetch primitives (`Request`/`Response`) with no framework-specific adapter required.

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

## Recommended file boundaries

- `server/trpc/router.ts`: router and procedure definitions
- `server/trpc/handler.ts`: `fetchRequestHandler` adapter glue
- `client/trpc.ts`: client singleton and links
- feature modules: call `trpc` from loaders/actions/components

## Production notes

- Ensure `createContext` reads auth/session from the incoming `Request`.
- Keep endpoint paths stable (`/trpc`) so SSR and client navigation share one transport target.
- Add headers and request metadata in links when you need tracing or tenant routing.

## Common pitfalls

- **Relative URL mismatch in SSR**: make sure server-side calls resolve correctly in your deployment runtime.
- **Duplicated client instances**: prefer one client per runtime boundary.
- **Context drift**: keep `createContext` logic in one place and test it.

## Related docs

- [Fetch adapter](/docs/server/adapters/fetch)
- [Vanilla client setup](../vanilla/setup.mdx)
