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

`call()` takes no options when the procedure needs no `ctx` and no services: `await call(health, undefined)`.

In-process calls have no HTTP request: you pass the `ctx` yourself (`createRouterClient` and `localLink` also take a function that makes it), and the handler's `createContext` doesn't run.

|                                   | `ctx`                                    | `layer`                                                    |
| --------------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `call()`                          | a value, for this call                   | built for the call and released after it                   |
| `createRouterClient`, `localLink` | a value, or a function run on every call | built on the first call and kept for the client's lifetime |

So create a router client once, not per request, and pass a `ctx` function for per-request values; a client made per request builds its layer again each time and never releases it. To share request-reading code with the handler, keep it in a function of the request and build one: `ctx: () => contextFor(HttpServerRequest.fromWeb(new Request(url, { headers })))`.

In-process callers (`createRouterClient`, `createTrpcRsc`, `localLink({ serializer: false })`) pass values by reference, so they keep native types whatever the [serializer](./serializers.md).

## Testing

Test in process with `createRouterClient` or `localLink`; [`examples/saas-api`](../../examples/saas-api/src/api.test.ts) tests its API with both and with `call()`. `@trpc12/trpc/internal/testing` is a semi-public `TestServer` Effect layer for real-server tests (with `@effect/vitest`'s `it.layer`); it has no compatibility promise.
