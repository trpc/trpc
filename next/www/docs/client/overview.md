---
title: The client
label: Overview
description: "`createTrpcClient` types every call from the router's type, and the call options from its links."
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
  batching,
  createTrpcClient,
  dedupeLink,
  httpLink,
  routerType,
} from '@trpc12/trpc/client';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [
    dedupeLink(),
    httpLink({ url: 'http://localhost:3000/trpc', batch: batching() }),
  ],
});

const post = await client.post.byId.query({ id: '1' });
//    ^?
await client.post.create.mutate({ title: 'Hi' });
```

Queries are called with `.query()`, mutations with `.mutate()` and subscriptions with `.subscribe()`, which returns an async iterable ([Subscriptions](../subscriptions/overview.md)).

`routerType<AppRouter>()` types the client from the router type alone.

When `AppRouter` is `any`, because its import doesn't resolve or the server's types didn't build, the client is the untyped one (`TrpcUntypedClient` from `@trpc12/trpc/extend`), which has only `request()` and `subscribe()`. The first procedure call is then a type error, rather than every call being typed `any`:

```ts twoslash
// @errors: 2339
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
// ---cut-end---
type AppRouter = any; // an import that didn't resolve

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
await client.post.byId.query({ id: '1' });
```

## Call options

The second argument holds `signal` (and `lastEventId` for subscriptions) plus the fields links read. Links declare those fields, and a client made with `router:` types them:

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
import {
  batching,
  createTrpcClient,
  dedupeLink,
  httpLink,
  routerType,
} from '@trpc12/trpc/client';
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [dedupeLink(), httpLink({ url: '/trpc', batch: batching() })],
});
const signal = new AbortController().signal;
const id = '1';
// ---cut-end---
await client.post.byId.query(
  { id },
  { signal, dedupe: false, headers: { 'x-trace': id } },
);
```

`headers`, `init`, `batch: false` (send this call alone), `reconnect: false` and `onResponse` are read by `httpLink`, `reconnect: false` also by `wsLink`, and `dedupe` by `dedupeLink`. A call takes only the fields its links read: a client over `wsLink` alone has no `headers`, and one over `localLink` has only `signal`. Your own links add fields by declaring them ([Custom links](./custom-links.md)).

## Errors

A call rejects with one of the procedure's errors (`defined: true`, with its `data`) or a built-in one (`defined: false`: `NETWORK_ERROR`, `CLIENT_CLOSED_REQUEST`, `INTERNAL_SERVER_ERROR`, …). The error's type lists them all, so a `switch` on `code` narrows it. `safe()` returns a result tuple instead of throwing, and `matchError()` checks that each error is handled ([Errors without try/catch](./errors.md)).

## Inferring types

`inferRouterOutputs` and `inferRouterInputs` name what the client receives and sends, by path. Pass the client's type (or the type of a function that makes it) and outputs follow its links' serializer, as its calls do:

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import type { AppRouter } from './server.ts';
// ---cut-end---
import type {
  inferRouterInputs,
  inferRouterOutputs,
} from '@trpc12/trpc/server';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: '/trpc', serializer: createSerializer() })],
});

type NewPost = inferRouterInputs<typeof client>['post']['create'];
//   ^?
type Post = inferRouterOutputs<typeof client>['post']['byId'];
//   ^?
```

A router type has no links, so `inferRouterOutputs<AppRouter>` is the outputs in the default serializer's form, plain JSON: `createdAt` is a `string`, as a client without a serializer receives it.

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
// ---cut-end---
import type { inferRouterOutputs } from '@trpc12/trpc/server';

type Post = inferRouterOutputs<AppRouter>['post']['byId'];
//   ^?
```

`inferProcedureOutput<AppRouter['post']['byId']>` is the output as the procedure returns it, which in-process callers (`createRouterClient`) receive too ([Serializers](../server/serializers.md#client-types-follow-the-link)).

## Other clients

- [The Effect client](./effect.md): an `Effect` per call and a `Stream` per subscription.
- [TanStack Query](../integrations/tanstack-query.md): query and mutation options for every TanStack framework.
- [Server-side calls](../server/server-side-calls.md): `createRouterClient` and `localLink`, in process.
