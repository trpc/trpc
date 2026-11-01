---
title: Custom links
description: Write a link with `link()`, and declare the call options it reads, the errors it fails with and what it needs.
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

Links receive the fields in `op.context`. `signal` and `lastEventId` are reserved: a link declaring either is a type error. A call takes only the fields some link in the chain declares, the built-in ones included: `httpLink` declares `headers`, `init`, `batch`, `reconnect` and `onResponse` (`BuiltinCallOptions`), `wsLink` only `reconnect`. A link of your own that sends requests and reads one of them declares it too, as in `link<{ context: Pick<BuiltinCallOptions, 'headers'> }>(…)`.

## Errors and unsupported types

A link can also declare the errors it fails calls with, and the operation types it can't carry. Declared errors join every call's typed union (`defined: true`). An error a link didn't declare reaches callers as a built-in one: a custom code becomes `CLIENT_ERROR`, and a built-in code loses its `data`. Procedures of an unsupported type lose their method.

A code of your own is a `TrpcError.Tagged` class, with its `data` schema. Declare it in `errors` and fail with it, and every call through the client can fail with it, typed:

```ts twoslash
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  link,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import type { AppRouter } from './server.ts';
declare const url: string;
declare const budget: { take(): boolean };
// ---cut-end---
import { TrpcError } from '@trpc12/trpc/client';
import { Schema, Stream } from 'effect';

class RateLimited extends TrpcError.Tagged('RATE_LIMITED', {
  data: Schema.Struct({ retryAfter: Schema.Number }),
}) {}

const rateLimit = link<{ errors: RateLimited }>((opts) =>
  budget.take()
    ? opts.next(opts.op)
    : Stream.fail(new RateLimited({ retryAfter: 5 })),
);

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [rateLimit, httpLink({ url })],
});
const [, err] = await safe(client.post.list.query());
if (err?.code === 'RATE_LIMITED') {
  err.data;
  //  ^?
}
```

A custom code is always defined, so every `matchError()` on the client now needs a `RATE_LIMITED` handler ([When the links change](./errors.md#when-the-links-change)).

A link that sends requests or reads responses itself declares the [link codes](./errors.md#errors-from-the-links) it fails calls with in `builtinErrors` (`link<{ builtinErrors: 'NETWORK_ERROR' }>`, failing with `new TrpcError.NetworkError()`), since a call's union has only the ones its links declare. They join the union as built-in errors (`defined: false`), with no `data`.

A link that declares `unsupported` takes the method off the procedures of that type:

```ts twoslash
// @errors: 2339
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  link,
  routerType,
} from '@trpc12/trpc/client';
import { t } from './server.ts';
declare const url: string;
const appRouter = t.router({
  onPost: t.procedure.subscription(async function* () {
    yield 'created';
  }),
});
type AppRouter = typeof appRouter;
// ---cut-end---
const restOnly = link<{ unsupported: 'subscription' }>((opts) =>
  opts.next(opts.op),
);

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [restOnly, httpLink({ url })],
});
client.onPost.subscribe();
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

`splitLink` and `switchLink` lack an operation type only when every branch does, and provide only what every branch provides. Their errors are every branch's: a call can fail with what any branch declares.

## Typing integrations from the client

TanStack context helpers read link types from the client factory's or the client's type, `createTrpcContext<typeof makeClient>()` (`ClientTypes<T>` gives a client type's router, link context and link types).

For building an integration of your own, `@trpc12/trpc/extend` has the untyped client and the link runner ([Extensions](../server/extensions.md#building-integrations)).
