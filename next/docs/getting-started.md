---
title: Getting started
description: A router, a handler that serves it, and a client that calls it with the router's types.
section: Getting started
order: 1
---

A router is a plain object of procedures. A handler serves it; a client calls it with the router's type.

```package-install
@trpc12/trpc zod
```

## Define a router

```ts twoslash title="server.ts"
import { createFetchHandler, error, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
// ---cut-start---
import { db } from './db.ts';
// ---cut-end---

const t = initTrpc<{ ctx: { user: string | null } }>();

export const appRouter = {
  post: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) => db.post.find(opts.input.id) ?? error({ code: 'NOT_FOUND' }),
      ),
    create: t.procedure
      .input(z.object({ title: z.string().min(1) }))
      .mutation((opts) =>
        db.post.create({ ...opts.input, author: opts.ctx.user }),
      ),
  },
};
export type AppRouter = typeof appRouter;

export const handler = createFetchHandler({
  router: appRouter,
  createContext: (opts) => ({
    user: opts.request.headers['authorization'] ?? null,
  }),
});
```

`request` is Effect's `HttpServerRequest`: `headers` is a record of lowercase names, and on fetch runtimes `request.source` is the web `Request`.

## Serve it

`handler.fetch(request)` is a web-standard handler: see [Adapters](./adapters/overview.md) to serve it. On Node:

```ts twoslash title="main.ts"
// ---cut-start---
import { handler } from './server.ts';
// ---cut-end---
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Layer } from 'effect';
import { serve } from '@trpc12/trpc/http';

serve(handler).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
  Layer.launch,
  NodeRuntime.runMain,
);
```

## Call it

The client imports only the type:

```ts twoslash title="client.ts"
// ---cut-start---
// @filename: server.ts
import { createFetchHandler, error, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import { db } from './db.ts';

const t = initTrpc<{ ctx: { user: string | null } }>();

export const appRouter = {
  post: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) => db.post.find(opts.input.id) ?? error({ code: 'NOT_FOUND' }),
      ),
    create: t.procedure
      .input(z.object({ title: z.string().min(1) }))
      .mutation((opts) =>
        db.post.create({ ...opts.input, author: opts.ctx.user }),
      ),
  },
};
export type AppRouter = typeof appRouter;
// @filename: client.ts
// ---cut-end---
import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});

const post = await client.post.byId.query({ id: '1' });
//    ^?
const [created, err] = await safe(client.post.create.mutate({ title: '' }));
if (err?.defined && err.code === 'BAD_REQUEST') {
  err.data.issues;
  //       ^?
}
```

`routerType<AppRouter>()` types the client from the router type alone, and the client also types what its links read (see [The client](./client/overview.md)).

## Naming

Names case acronyms as words: `TrpcError`, `initTrpc`, `createTrpcClient`, `OpenApi…`, `Json…`.

## Next steps

- [Procedures](./server/procedures.md): input, output and the three procedure types.
- [Errors](./server/errors.md): typed errors without declaring them.
- [Middleware](./server/middleware.md): context, base procedures and reusable middleware.
- [Migrating from v11](./migrations/from-v11.md): serve old clients while you move.
