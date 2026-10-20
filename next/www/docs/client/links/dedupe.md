---
title: '`dedupeLink`'
description: Share one request between identical queries or subscriptions that haven't sent anything back yet.
section: Client
parent: client/links
order: 6
---

`dedupeLink()` lets a call join an identical one that hasn't sent anything back yet, instead of sending its own. It's the same rule for queries and subscriptions; mutations always pass through.

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
declare const id: string;
// ---cut-end---
import {
  createTrpcClient,
  dedupeLink,
  httpLink,
  routerType,
} from '@trpc12/trpc/client';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [dedupeLink(), httpLink({ url: 'http://localhost:3000/trpc' })],
});

const [a, b] = await Promise.all([
  client.post.byId.query({ id }),
  client.post.byId.query({ id }),
]);
await client.post.byId.query({ id }, { dedupe: false });
```

The two calls in `Promise.all` make one request, and both get the same value. A call is identical when it has:

- the same path, or the same `key(op)` when you pass one, which replaces the input comparison;
- a deeply equal input, so `{ a, b }` and `{ b, a }` match. Plain objects, arrays, `Map`s, `Set`s, `Date`s and the other built-in types compare by content; a `File` or a class instance matches only itself;
- equal call options: different `headers` or `init` are sent apart. `headers` compare as `Headers`;
- the same `lastEventId`.

A joining call gets every value, the end and any error, and its `onResponse` is called. Once the first value has arrived, the call isn't joinable any more: a subscription made after its first event subscribes on its own, since it would miss the events before it.

- A caller that stops or aborts leaves the others reading. The request stops once every caller has stopped, and its signal aborts once every caller still reading has aborted. A caller that has its result no longer counts, so aborting its signal afterwards doesn't stop a stream in the output; stop reading the stream instead.
- Every caller gets the same value, so don't change it, and don't change an input while its call is in flight.
- A stream in a query's output, an `AsyncIterable` or a `ReadableStream`, is one stream for every caller: readers would split its items. Callers that each read it should pass `dedupe: false`.
- The `dedupe: false` call option sends that call on its own.

Put it before [`retryLink`](./retry.md), so a retried query is still shared.
