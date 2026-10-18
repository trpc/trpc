---
title: dedupeLink
description: Share one request between identical queries in flight.
section: Client
parent: client/links
order: 6
---

`dedupeLink()` shares identical queries in flight: a query with the same path and input as one still running gets that one's result instead of sending its own. Mutations and subscriptions always pass through.

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

- `key(op)`: the key identical queries share, by default the path and the serialized input.
- The `dedupe: false` call option sends that query on its own.

Put it before [`retryLink`](./retry.md), so a retried query is still shared.
