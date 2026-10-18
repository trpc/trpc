---
title: loggerLink
description: Log every operation, its results and its errors, to the console or a function of your own.
section: Client
parent: client/links
order: 7
v11: client/links/loggerLink
---

`loggerLink()` logs every operation as it goes out, each result as it comes back and each error. By default it writes `>> query #1 post.byId` with the input, then `<< query #1 post.byId` with the result, to the console (errors with `console.error`).

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
// ---cut-end---
import {
  createTrpcClient,
  httpLink,
  loggerLink,
  routerType,
} from '@trpc12/trpc/client';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [
    loggerLink({ enabled: () => process.env.NODE_ENV === 'development' }),
    httpLink({ url: 'http://localhost:3000/trpc' }),
  ],
});
```

- `enabled(op)`: whether to log this operation. Others pass through untouched.
- `log(event)`: replaces the console output. `event.direction` is `'up'` for the operation going out, `'down'` for each result (with `result` and `elapsedMs`) and `'error'` for a failure (with `error` and `elapsedMs`).

A subscription logs a `'down'` event per event. Put the logger first to see calls as your code made them, or after a [`splitLink`](./split.md) to log one branch.
