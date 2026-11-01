---
title: Server-side calls
description: Call procedures in process with `createRouterClient`, `t.call()` and `localLink`.
section: Server
order: 13
---

```ts twoslash
// ---cut-start---
import { appRouter, t } from './server.ts';
const user = { id: '1', name: 'Ada' };
// ---cut-end---
import { createRouterClient } from '@trpc12/trpc/server';

const caller = createRouterClient(appRouter, { ctx: { user } });
const post = await caller.post.byId.query({ id: '1' });

await t.call(appRouter.post.byId, { id: '1' }, { ctx: { user } });
```

`localLink({ router })` does the same inside a client's link chain. For React Server Actions, see [Server Actions](../integrations/server-actions.md).

`createRouterClient` and `localLink` type `ctx` from the root router, made with `t.router()` ([Routers](./routers.md)). A procedure's type leaves out its root `ctx`, so `t.call()` takes it from `t`: the `ctx` is `t`'s, plus any key a standalone middleware on the procedure needs. It takes no options when the procedure needs no `ctx` and no services: `await t.call(health, undefined)`.

In-process calls have no HTTP request: you pass the `ctx` yourself (`createRouterClient` and `localLink` also take a function that makes it), and the handler's `createContext` doesn't run.

|                                   | `ctx`                                    | Effect services                                                           |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| `t.call()`                        | a value, for this call                   | a `layer` built for the call and released when it returns, or a `runtime` |
| `createRouterClient`, `localLink` | a value, or a function run on every call | a `runtime` you own and dispose                                           |

Pass a `ctx` function for per-request values. To share request-reading code with the handler, keep it in a function of the request and build one: `ctx: () => contextFor(HttpServerRequest.fromWeb(new Request(url, { headers })))`.

In-process callers (`createRouterClient`, `createTrpcRsc`, `localLink({ transformer: false })`) pass values by reference, so they keep native types whatever the [transformer](./transformers.md). A procedure's own response arrives as a web `Response` from all of them ([Responses](./responses.md#returning-a-response)).

## Services

When the router's procedures need Effect services, `createRouterClient` and `localLink` require a `runtime`: a `ManagedRuntime` that you make from the layer and dispose. It builds the layer on its first use, every call reads its services, and `dispose()` runs the layer's finalizers (closing a pool, say). Clients sharing a runtime share its services:

```ts twoslash
// ---cut-start---
import { t, type Post } from './server.ts';
declare const PostRepoLive: import('effect').Layer.Layer<PostRepo>;
// ---cut-end---
import { createRouterClient } from '@trpc12/trpc/server';
import { Context, Effect, ManagedRuntime } from 'effect';

class PostRepo extends Context.Service<
  PostRepo,
  { all: Effect.Effect<Post[]> }
>()('PostRepo') {}

const router = t.router({
  list: t.procedure.query(() => Effect.flatMap(PostRepo, (repo) => repo.all)),
});

await using runtime = ManagedRuntime.make(PostRepoLive);
const caller = createRouterClient(router, { ctx: { user: null }, runtime });
await caller.list.query();
// Leaving the scope disposes `runtime`, which runs the layer's finalizers.
```

A client has no lifetime to release a layer at, so passing it a `layer` is a type error that says to pass `runtime: ManagedRuntime.make(layer)` instead. A call after `dispose()` fails with an `INTERNAL_SERVER_ERROR` instead of reaching released services, and so does a call whose layer fails to build, with the layer's error as its `cause`.

`t.call()` takes either. Its `layer` is built for the call and released when the promise resolves, before a streamed output is read; pass a `runtime` for procedures whose output streams.

## Testing

Test in process with `createRouterClient` or `localLink`; [`examples/saas-api`](../../../examples/saas-api/src/api.test.ts) tests its API with both and with `t.call()`, making each test's runtime with `await using` so its services are released when the test ends. `@trpc12/trpc/internal/testing` is a semi-public `TestServer` Effect layer for real-server tests (with `@effect/vitest`'s `it.layer`); it has no compatibility promise.
