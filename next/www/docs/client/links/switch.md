---
title: '`switchLink`'
description: Pick one of several named chains per call, and let a call force one with a typed call option.
section: Client
parent: client/links
order: 4
---

`switchLink({ name, links, pick })` sends each call down one of several named branches. `pick` chooses the branch for a call, and `name` becomes a typed call option, so one call can override `pick`:

```ts twoslash
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  routerType,
  switchLink,
  wsLink,
} from '@trpc12/trpc/client';
import { t } from './server.ts';
const appRouter = t.router({
  report: t.procedure.query(() => ({ views: 0 })),
});
type AppRouter = typeof appRouter;
declare const url: string;
declare const wsUrl: string;
declare const input: undefined;
// ---cut-end---
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [
    switchLink({
      name: 'transport',
      links: {
        http: httpLink({ url, batch: true }),
        ws: wsLink({ url: wsUrl }),
      },
      pick: (op) => (op.type === 'subscription' ? 'ws' : 'http'),
    }),
  ],
});
await client.report.query(input, { transport: 'http' });
```

A branch can be a chain (an array of links), including another `switchLink`. On a client made with `router:`, `pick` sees typed paths.

The name can't be `signal`, `lastEventId`, `init`, `headers` or `reconnect`, and two switch links on one chain can't share a name; both are type errors and throw when the link is made.

Like [`splitLink`](./split.md), calls get the call options and errors of every branch's links ([Custom links](../custom-links.md#branching-links)).
