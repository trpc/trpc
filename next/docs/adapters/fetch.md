---
title: Fetch runtimes
description: Cloudflare Workers, Next.js route handlers and other fetch runtimes take handler.fetch as it is.
section: Adapters
order: 5
v11: server/adapters/fetch
---

Cloudflare Workers, Next.js route handlers, Lambda function URLs and other fetch runtimes take `handler.fetch` as it is.

```ts
// Cloudflare Workers
export default { fetch: handler.fetch };

// Next.js: app/api/trpc/[[...trpc]]/route.ts (batches POST to /api/trpc itself),
// with createFetchHandler({ router, endpoint: '/api/trpc' })
export const GET = handler.fetch;
export const POST = handler.fetch;
```

## Platform arguments

On Workers, `env` and `ctx` come with each request, not with the handler. Pass them as the platform argument, typed by the handler's second type parameter; `createContext` reads them:

```ts
const handler = createFetchHandler<
  AppRouter,
  { env: Env; ctx: ExecutionContext }
>({
  router,
  createContext: ({ platform }) => ({
    db: platform.env.DB,
    waitUntil: (p: Promise<unknown>) => platform.ctx.waitUntil(p),
  }),
});

export default {
  fetch: (request, env, ctx) => handler.fetch(request, { env, ctx }),
} satisfies ExportedHandler<Env>;
// in a resolver: ctx.waitUntil(sendWelcomeEmail(user))
```

With a platform type, `handler.fetch(request)` without it is a type error, and so is `handler.websocket(socket, { request })` without `platform`. Without one, `fetch` takes the request alone, which is what Next's route handler types expect. `serve()`, Node and Bun pass nothing, and `platform` is `undefined`.

## Effect middleware on a fetch runtime

For Effect HTTP middleware in front of the handler on a fetch runtime, convert the Effect app back to a web handler:

```ts
import { HttpEffect } from 'effect/http';

const fetch = HttpEffect.toWebHandler(toHttpEffect(handler));
```

WebSockets on Workers go through a Durable Object: see [Durable Objects](./durable-objects.md).
