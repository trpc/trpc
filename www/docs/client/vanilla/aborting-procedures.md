---
id: aborting-procedure-calls
title: Aborting Procedure Calls
sidebar_label: Aborting Procedure Calls
slug: /client/vanilla/aborting-procedure-calls
---

tRPC supports the standard `AbortController`/`AbortSignal` API for aborting procedures. All you have to do is pass an `AbortSignal` to the query or mutation options, and call the `AbortController` instance's `abort` method if you need to cancel the request.

```ts twoslash title="utils.ts"
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  userById: t.procedure.input(z.string()).query(({ input }) => ({ id: input, name: 'Bilbo' })),
  updateUser: t.procedure
    .input(z.object({ id: z.string(), name: z.string() }))
    .mutation(({ input }) => input),
});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
});

// Pass a signal to a query
const queryController = new AbortController();
const query = client.userById.query('id_bilbo', {
  signal: queryController.signal,
});
queryController.abort();

// Mutation options accept a signal too
const mutationController = new AbortController();
const mutation = client.updateUser.mutate(
  { id: 'id_bilbo', name: 'Bilbo' },
  { signal: mutationController.signal },
);
mutationController.abort();
```

## Cancelling work on the server

Aborting a client request stops the client from waiting for the response and asks the transport to cancel the request. It does not interrupt JavaScript already running on the server or roll back side effects that a mutation has already committed.

Procedure resolvers receive the request's `signal`. Pass it to APIs that support `AbortSignal`, or check `signal.aborted` in long-running work, to stop cooperatively when the server detects that the request was cancelled.

```ts twoslash title="server.ts"
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

const appRouter = t.router({
  report: t.procedure.query(async ({ signal }) => {
    const response = await fetch('https://example.com/report', { signal });
    return response.json();
  }),
});
```
