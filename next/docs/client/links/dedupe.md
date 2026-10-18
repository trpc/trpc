---
title: dedupeLink
description: Share one request between identical queries in flight.
section: Client
parent: client/links
order: 6
---

`dedupeLink()` shares identical queries in flight: a query with the same path, input and call options as one still running gets that one's result instead of sending its own. Mutations and subscriptions always pass through.

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

The two calls in `Promise.all` make one request. A caller that aborts leaves the others waiting, and the request is aborted only once every caller has.

- Inputs are compared deeply, so `{ a, b }` and `{ b, a }` are the same input. Plain objects, arrays, `Map`s, `Set`s, `Date`s and the other built-in types compare by content; a `File` or a class instance matches only itself.
- Call options must be equal too: calls with different `headers` or `init` are sent apart. Every caller's `onResponse` is called, and one that throws fails only its own call.
- Every caller gets the same result value, so don't change it, and don't change an input while its call is in flight.
- A stream in the result, an `AsyncIterable` or a `ReadableStream`, is copied to each caller that starts reading it before anyone has read an item. A caller that starts later sends the query again and reads its own.
- `key(op)` groups calls by a string of yours instead of comparing inputs; call options are still compared.
- The `dedupe: false` call option sends that query on its own.

Put it before [`retryLink`](./retry.md), so a retried query is still shared.
