---
title: '`splitLink`'
description: Send each call down one of two chains, picked from its path, type or input.
section: Client
parent: client/links
order: 3
v11: client/links/splitLink
---

`splitLink({ condition, true, false })` sends a call down the `true` chain when `condition` returns true for it, and down `false` otherwise. Each branch is a link or an array of links. On a client made with `router:`, `condition` sees typed paths:

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
// ---cut-end---
import {
  createTrpcClient,
  httpLink,
  routerType,
  splitLink,
  wsLink,
} from '@trpc12/trpc/client';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: wsLink({ url: 'ws://localhost:3000/trpc' }),
      false: httpLink({ url: 'http://localhost:3000/trpc', batch: true }),
    }),
  ],
});
```

Calls get the call options and errors that the links of either branch declare. An operation type is missing only if every branch lacks it, and the link provides only what every branch provides ([Custom links](../custom-links.md#branching-links)). For more than two branches, or to let a call pick its branch, use [`switchLink`](./switch.md).

## One client, several backends

A link can change the operation it passes on. That lets one client cover routers served by different backends, even ones with different contexts:

```ts twoslash
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  link,
  routerType,
  splitLink,
} from '@trpc12/trpc/client';
import { t, type AppRouter } from './server.ts';
const shopRouter = t.router({
  cart: t.procedure.query(() => [] as string[]),
});
type BlogRouter = AppRouter;
type ShopRouter = typeof shopRouter;
declare const blogUrl: string;
declare const shopUrl: string;
// ---cut-end---
const unprefix = (prefix: string) =>
  link((opts) =>
    opts.next({ ...opts.op, path: opts.op.path.slice(prefix.length + 1) }),
  );

createTrpcClient({
  router: routerType<{ blog: BlogRouter; shop: ShopRouter }>(),
  links: [
    splitLink({
      condition: (op) => op.path.startsWith('shop.'),
      true: [unprefix('shop'), httpLink({ url: shopUrl })],
      false: [unprefix('blog'), httpLink({ url: blogUrl })],
    }),
  ],
});
```
