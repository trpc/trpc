---
title: '`localLink`'
description: Call a router in the same process, through the client and its other links.
section: Client
parent: client/links
order: 8
v11: client/links/localLink
---

`localLink({ router })` runs calls against a router in the same process, with no HTTP in between. The client, its types and the links before it work as they do over the network, which suits tests, server code and apps that bundle the router with the client. Its errors leave out the network's ([Errors from the links](../errors.md#errors-from-the-links)), so its TanStack Query helpers don't pass where helpers typed from an `httpLink` client are expected; for those, give `httpLink` a `fetch` that calls the handler in process, `fetch: (input, init) => handler.fetch(new Request(input, init))`.

```ts twoslash
// ---cut-start---
import { appRouter } from './server.ts';
// ---cut-end---
import { createTrpcClient, localLink, routerType } from '@trpc12/trpc/client';

const client = createTrpcClient({
  router: routerType<typeof appRouter>(),
  links: [
    localLink({ router: appRouter, createContext: () => ({ user: null }) }),
  ],
});
const posts = await client.post.list.query();
```

- `router`: the router to call.
- `createContext()`: makes the `ctx` of each call, required when the router's procedures need one. The handler's `createContext` doesn't run, since there is no request ([Server-side calls](../../server/server-side-calls.md)).
- `layer`: provides the Effect services the router needs, as the handler's `layer` does.
- `serializer`: inputs and outputs round-trip through it as over the wire, `jsonSerializer` by default. `false` passes values by reference, so they keep native types.

Without other links to run, `createRouterClient(router, { ctx })` calls a router in process with less setup ([Server-side calls](../../server/server-side-calls.md)).
