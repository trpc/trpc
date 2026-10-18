---
title: Custom links
description: Write a link with link(), and declare the call options it reads, the errors it fails with and what it needs.
section: Client
parent: client/links
order: 10
v11: client/links
---

`link(({ op, next }) => stream)` writes a link: it gets the operation and the rest of the chain, and returns an Effect `Stream` (a query or mutation is a one-element stream). Links written for v11 run unchanged through [`fromV11Link`](../migrations/from-v11/links.md) from `@trpc12/trpc/interop`.

## Call options

A link of your own declares what it reads, and the client types it as a call option:

```ts twoslash
// ---cut-start---
import { link } from '@trpc12/trpc/client';
declare function span(traceId: string | undefined): void;
// ---cut-end---
const traceLink = link<{ context: { traceId?: string } }>((opts) => {
  span(opts.op.context.traceId);
  return opts.next(opts.op);
});
// client.post.byId.query(input, { traceId: 'abc' })
```

Links receive the fields in `op.context`. `signal` and `lastEventId` are reserved: a link declaring either is a type error. The built-in fields (`headers`, `init`, `batch`, `reconnect`, `onResponse`) are always there; anything else comes from what your links declare.

## Errors and unsupported types

A link can also declare the errors it fails calls with, and the operation types it can't carry. Declared errors join every call's typed union (`defined: true`). Procedures of an unsupported type lose their method:

```ts
class RateLimited extends TrpcError.Tagged('RATE_LIMITED', {
  data: Schema.Struct({ retryAfter: Schema.Number }),
}) {}

const rateLimit = link<{ errors: RateLimited }>((opts) =>
  budget.take()
    ? opts.next(opts.op)
    : Stream.fail(new RateLimited({ retryAfter: 5 })),
);
const restOnly = link<{ unsupported: 'subscription' }>(/* … */);

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [rateLimit, restOnly, httpLink({ url })],
});
const [, err] = await safe(client.post.create.mutate(input));
if (err?.defined && err.code === 'RATE_LIMITED') retryIn(err.data.retryAfter);
client.onPost.subscribe; // type error: no link carries subscriptions
```

## Reading the response

`httpLink` hands each call's response to an `onResponse` call option (`{ status, headers }`), before the value goes up the chain. A batched call gets its own line's status and the batch's headers. A link that reads it declares `needs: 'response'`, and the client rejects a `links` array with no link after it that `provides: 'response'`:

```ts twoslash
// @errors: 2322
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  link,
  routerType,
} from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
declare const url: string;
declare function checkVersion(version: string | null): void;
// ---cut-end---
const versionLink = link<{ needs: 'response' }>((opts) =>
  opts.next({
    ...opts.op,
    context: {
      ...opts.op.context,
      onResponse: (res) => {
        checkVersion(res.headers.get('x-version'));
        opts.op.context.onResponse?.(res);
      },
    },
  }),
);
createTrpcClient({
  router: routerType<AppRouter>(),
  links: [versionLink, httpLink({ url })],
});
createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url }), versionLink],
}); // type error
```

## Branching links

`splitLink` and `switchLink` lack an operation type only when every branch does, and provide only what every branch provides. Built-in links carry every type, and their failures (`NETWORK_ERROR`, `CLIENT_CLOSED_REQUEST`) stay in the untyped part of the union.

## Typing integrations from the client

TanStack context helpers read link types from the client factory's or the client's type, `createTrpcContext<typeof makeClient>()` (`ClientTypes<T>` gives a client type's router, link context and link types).

For building an integration of your own, `@trpc12/trpc/extend` has the untyped client and the link runner ([Extensions](../server/extensions.md#building-integrations)).
