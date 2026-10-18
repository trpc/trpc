---
title: The client
label: Overview
description: createTrpcClient types every call from the router's type, and the call options from its links.
section: Client
order: 1
v11: client
---

`createTrpcClient` takes the router's type and a chain of [links](./links.md). It imports no server code:

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
// ---cut-end---
import {
  createTrpcClient,
  dedupeLink,
  httpLink,
  routerType,
} from '@trpc12/trpc/client';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [
    dedupeLink(),
    httpLink({ url: 'http://localhost:3000/trpc', batch: true }),
  ],
});

const post = await client.post.byId.query({ id: '1' });
//    ^?
await client.post.create.mutate({ title: 'Hi' });
```

Queries are called with `.query()`, mutations with `.mutate()` and subscriptions with `.subscribe()`, which returns an async iterable ([Subscriptions](../subscriptions/overview.md)).

`routerType<AppRouter>()` types the client from the router type alone. A [contract](../server/contract-first.md) can stand in for it: `router: appContract`.

## Call options

The second argument holds `signal` (and `lastEventId` for subscriptions) plus the fields links read. Links declare those fields, and a client made with `router:` types them:

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
import {
  createTrpcClient,
  dedupeLink,
  httpLink,
  routerType,
} from '@trpc12/trpc/client';
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [dedupeLink(), httpLink({ url: '/trpc', batch: true })],
});
const signal = new AbortController().signal;
const id = '1';
// ---cut-end---
await client.post.byId.query(
  { id },
  { signal, dedupe: false, headers: { 'x-trace': id } },
);
```

`headers`, `init` and `batch: false` (send this call alone) are read by `httpLink`, and `dedupe` by `dedupeLink`. The built-in fields (`headers`, `init`, `batch`, `reconnect`, `onResponse`) are always there; anything else comes from what your links declare ([Custom links](./custom-links.md)).

## Errors

A call rejects with the procedure's typed errors (`defined: true`, narrowed by `code`) or an unexpected one. `safe()` returns a result tuple instead of throwing ([Errors without try/catch](./errors.md)).

## Other clients

- [The Effect client](./effect.md): an `Effect` per call and a `Stream` per subscription.
- [TanStack Query](../integrations/tanstack-query.md): query and mutation options for every TanStack framework.
- [Server-side calls](../server/server-side-calls.md): `createRouterClient` and `localLink`, in process.
