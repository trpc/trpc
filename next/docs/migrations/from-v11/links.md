---
title: Your v11 links
label: v11 links
description: '`fromV11Link` runs a v11 `TRPCLink` in a v12 chain, so you can move links one at a time, and what a rewritten link looks like.'
section: Migrations
parent: migrations/from-v11
order: 3
---

Your own v11 links (`TRPCLink`s) run in a v12 chain through `fromV11Link`, so you can move them over one at a time:

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { V11Link } from '@trpc12/trpc/interop';
import type { AppRouter } from './server.ts';
declare const authLink: V11Link;
declare const url: string;
// ---cut-end---
import { fromV11Link } from '@trpc12/trpc/interop';

createTrpcClient({
  router: routerType<AppRouter>(),
  links: [fromV11Link(authLink), httpLink({ url })],
});
```

The v11 link gets v11 operations and observables, so `observable()`, `tap()` and `share()` from `@trpc/server/observable` work as before. What it gets from `next`:

- Errors read like `TRPCClientError`s, with v11's `data.code`, `data.httpStatus` and `shape`, so a `retryLink` that checks `opts.error.data?.code` works as before. They aren't `instanceof TRPCClientError`, though. The v12 `TrpcError` is `error.cause`, and it's what the client gets when the link passes the error on. Errors the link makes itself keep their `data.code`.
- Subscription results are `{ type: 'started' }`, then `{ type: 'data', data }` for each event; there is no `stopped` result.

A v11 terminating link (one that sends the request itself, such as v11's `httpBatchLink`) works too.

Rewritten for v12, a link returns an Effect `Stream`:

```ts twoslash
// ---cut-start---
import { link } from '@trpc12/trpc/client';
declare function token(): string;
// ---cut-end---
const authLink = link((opts) =>
  opts.next({
    ...opts.op,
    context: { ...opts.op.context, headers: { authorization: token() } },
  }),
);
```
