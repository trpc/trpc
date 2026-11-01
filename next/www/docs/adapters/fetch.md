---
title: Fetch runtimes
description: Cloudflare Workers, Next.js route handlers and other fetch runtimes take `handler.fetch` as it is.
section: Adapters
order: 5
v11: server/adapters/fetch
---

Cloudflare Workers, Next.js route handlers, Lambda function URLs and other fetch runtimes take `handler.fetch` as it is.

```ts twoslash
// ---cut-start---
import { handler } from './server.ts';
// ---cut-end---
// Cloudflare Workers
export default { fetch: handler.fetch };

// Next.js: app/api/trpc/[[...trpc]]/route.ts (batches POST to /api/trpc itself),
// with createFetchHandler({ router, endpoint: '/api/trpc' })
export const GET = handler.fetch;
export const POST = handler.fetch;
```

## Platform arguments

On Workers, `env` and `ctx` come with each request, not with the handler. Pass them as the platform argument, typed by the handler's second type parameter; `createContext` reads them:

```ts twoslash
// ---cut-start---
/// <reference types="@cloudflare/workers-types" />
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
interface Env {
  DB: D1Database;
}
const t = initTrpc<{
  ctx: { db: D1Database; waitUntil: (p: Promise<unknown>) => void };
}>();
const router = t.router({ health: t.procedure.query(() => 'ok') });
type AppRouter = typeof router;
// ---cut-end---
const handler = createFetchHandler<
  AppRouter,
  { env: Env; ctx: ExecutionContext }
>({
  router,
  createContext: (opts) => ({
    db: opts.platform.env.DB,
    waitUntil: (p: Promise<unknown>) => opts.platform.ctx.waitUntil(p),
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

```ts twoslash
// ---cut-start---
import { handler } from './server.ts';
// ---cut-end---
import { HttpEffect } from 'effect/http';
import { toHttpEffect } from '@trpc12/trpc/http';

const fetch = HttpEffect.toWebHandler(toHttpEffect(handler));
```

WebSockets on Workers go through a Durable Object.
