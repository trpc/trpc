# Getting started

A router is a plain object of procedures. A handler serves it; a client calls it with the router's type.

```ts
// server.ts
import { createFetchHandler, error, initTrpc } from 'trpcdev/server';
import { z } from 'zod';

const t = initTrpc<{ ctx: { user: string | null } }>();

export const appRouter = {
  post: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(
        ({ input }) => db.post.find(input.id) ?? error({ code: 'NOT_FOUND' }),
      ),
    create: t.procedure
      .input(z.object({ title: z.string().min(1) }))
      .mutation(({ input, ctx }) =>
        db.post.create({ ...input, author: ctx.user }),
      ),
  },
};
export type AppRouter = typeof appRouter;

export const handler = createFetchHandler({
  router: appRouter,
  createContext: ({ request }) => ({
    user: request.headers.get('authorization'),
  }),
});
```

`handler.fetch(request)` is a web-standard handler: see [Platforms](./platforms.md) to serve it. On Node:

```ts
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Layer } from 'effect';
import { serve } from 'trpcdev/http';

serve(handler).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
  Layer.launch,
  NodeRuntime.runMain,
);
```

The client imports only the type:

```ts
import { createTrpcClient, httpLink, routerType, safe } from 'trpcdev/client';
import type { AppRouter } from './server';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});

const post = await client.post.byId.query({ id: '1' });
const [created, err] = await safe(client.post.create.mutate({ title: '' }));
if (err?.defined && err.code === 'BAD_REQUEST') err.data.issues; // typed
```

`routerType<AppRouter>()` lets the client also type what its links read (see [Client](./client.md)). `createTrpcClient<AppRouter>({ links })` works too.

Names case acronyms as words: `TrpcError`, `initTrpc`, `createTrpcClient`, `OpenApi…`, `Json…`.
