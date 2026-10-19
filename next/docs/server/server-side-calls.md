---
title: Server-side calls
description: Call procedures in process with `createRouterClient`, `call()` and `localLink`.
section: Server
order: 13
---

```ts twoslash
// ---cut-start---
import { appRouter } from './server.ts';
const user = { id: '1', name: 'Ada' };
// ---cut-end---
import { call, createRouterClient } from '@trpc12/trpc/server';

const caller = createRouterClient(appRouter, { ctx: { user } });
const post = await caller.post.byId.query({ id: '1' });

await call(appRouter.post.byId, { id: '1' }, { ctx: { user } });
```

`localLink({ router })` does the same inside a client's link chain. For React Server Actions, see [Server Actions](../integrations/server-actions.md).

In-process calls have no HTTP request: you pass the `ctx` (or a function that makes it) yourself, and the handler's `createContext` doesn't run. To share request-reading code with the handler, keep it in a function of the request and build one: `ctx: () => contextFor(HttpServerRequest.fromWeb(new Request(url, { headers })))`.

In-process callers (`createRouterClient`, `createTrpcRsc`, `localLink({ serializer: false })`) pass values by reference, so they keep native types whatever the [serializer](./serializers.md).

## Testing

Test in process with `createRouterClient` or `localLink`; [`examples/saas-api`](../../examples/saas-api/src/api.test.ts) tests its API with both and with `call()`. `@trpc12/trpc/internal/testing` is a semi-public `TestServer` Effect layer for real-server tests (with `@effect/vitest`'s `it.layer`); it has no compatibility promise.
