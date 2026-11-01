---
title: Should a base procedure, middleware or plugin be able to provide a `Layer`, built once per runtime?
summary: A plugin's services must be in the app's `layer` today. `.provide(layer)` would let it bring them, built once in the handler's runtime.
area: effect
recommended: B
questions: [Q27.1]
links:
  - kind: spike
    label: layered-services
    url: ../../spikes/layered-services/
  - kind: proposal
    label: 27 Layered services and strictness
    url: ../proposals/27-layered-services-and-strictness.md
  - kind: decision
    label: layered-services-and-strictness
    url: ../decisions/layered-services-and-strictness.md
  - kind: decision
    label: router-client-runtime
    url: ../decisions/router-client-runtime.md
  - kind: note
    label: layered-services spike
    url: ../notes/layered-services-and-strictness.md
  - kind: docs
    label: Effect, the services a router needs
    url: https://v12.trpc.io/v12/docs/server/effect#the-services-a-router-needs
  - kind: code
    label: ProcedureBuilder.provide
    url: ../../packages/trpc/src/server/procedures/builder.ts
---

# Should a base procedure, middleware or plugin be able to provide a `Layer`, built once per runtime?

## Why it matters

The human asked "can we also layer in deps in middlewares / base procedures / plugins?". Today `.provide(Key, make)` builds a service per call, and anything built once (a pool, a Redis client) must be in the handler's `layer` or `runtime`. So a plugin with a Redis-backed cache adds `Cache` to the router's required services and tells every user to add `Cache.layer`. Since the second Effect pass, handlers and in-process clients can share one caller-owned `ManagedRuntime`, so "built once" can now mean once per app, not once per entry point.

## Options

### A) Keep it as it is: shared services come from the handler

```ts twoslash
// ---cut-start---
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { Context, Effect, Layer, ManagedRuntime } from 'effect';
interface ScopedCache {
  get: (key: string) => Effect.Effect<string | undefined>;
}
class Cache extends Context.Service<
  Cache,
  { scoped: (name: string) => ScopedCache }
>()('Cache') {
  declare static readonly layer: Layer.Layer<Cache, never, Redis>;
}
class CacheKey extends Context.Service<CacheKey, ScopedCache>()('CacheKey') {}
class Redis extends Context.Service<Redis, {}>()('Redis') {}
declare const RedisLive: Layer.Layer<Redis>;
class Db extends Context.Service<Db, {}>()('Db') {
  declare static readonly layer: Layer.Layer<Db>;
}
// ---cut-end---
// a plugin
export const cached = initTrpc().procedure.provide(CacheKey, () =>
  Effect.map(Cache, (cache) => cache.scoped('posts')),
); // requires Cache
// ---cut-start---
const router = initTrpc().router({ posts: cached.query(() => 'posts') });
// ---cut-end---

// the app has to know and provide the plugin's layer
const runtime = ManagedRuntime.make(
  Layer.mergeAll(Db.layer, Cache.layer.pipe(Layer.provide(RedisLive))),
);
createFetchHandler({ router, runtime });
```

- ✅ One place for everything built once, and a startup that fails early if a layer can't build
- ✅ Nothing to add
- ❌ A plugin can't be self-contained: its dependencies leak into every app's `layer`
- ❌ A base procedure can't own a repository its procedures share; the app wires it

### B) `.provide(layer)`, built once per runtime

An overload of `.provide()` taking a `Layer`. Its services drop out of the router's required services; what the layer needs joins them. It's built the first time a procedure using it runs, in the runtime's memo map, so the same layer value is built once and shared (also with the app's own layer graph), and released when the runtime is.

```ts twoslash
// ---cut-start---
import {
  createFetchHandler,
  type inferRouterServices,
} from '@trpc12/trpc/server';
import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { z } from 'zod';
import { initTrpcB as initTrpc } from '../open/provide-layer.ts';
import type { Post } from './server.ts';
const t = initTrpc();
const ById = z.object({ id: z.string() });
class Db extends Context.Service<
  Db,
  { post: (id: string) => Effect.Effect<Post> }
>()('Db') {
  declare static readonly layer: Layer.Layer<Db>;
}
class Redis extends Context.Service<Redis, {}>()('Redis') {}
declare const RedisLive: Layer.Layer<Redis>;
class Cache extends Context.Service<Cache, {}>()('Cache') {
  declare static readonly layer: Layer.Layer<Cache, never, Redis>;
}
// ---cut-end---
class PostRepo extends Context.Service<
  PostRepo,
  { find(id: string): Effect.Effect<Post> }
>()('PostRepo') {
  static readonly layer = Layer.effect(
    PostRepo,
    Effect.map(Db, (db) => ({ find: (id) => db.post(id) })),
  );
}

const withRepo = t.procedure.provide(PostRepo.layer); // Layer<PostRepo, never, Db>

export const router = t.router({
  post: {
    byId: withRepo
      .input(ById)
      .query((opts) =>
        Effect.flatMap(PostRepo, (repo) => repo.find(opts.input.id)),
      ),
  },
});

type Services = inferRouterServices<typeof router>;
//   ^?
createFetchHandler({ router, runtime: ManagedRuntime.make(Db.layer) });

// a plugin brings its own layer
export const cached = initTrpc().procedure.provide(
  Cache.layer.pipe(Layer.provide(RedisLive)),
);
```

- ✅ The Effect way: built once and provided to requests, as `RpcGroup.toLayer` and `HttpRouter.provideRequest` do; plugins become self-contained
- ✅ Shared through the runtime's memo map: the handler, `createRouterClient`, `localLink` and `makeFetchHandler`'s context all use one instance when they share a runtime, and `dispose()` releases it
- ✅ Measured: +8 instantiations per procedure (+3%), about 0.4 KB gzip on the server, none on the client
- ❌ Two lifetimes under one name: `.provide(Key, make)` per call, `.provide(layer)` once
- ❌ Built lazily, so a broken layer fails the first call that needs it (a masked `INTERNAL_SERVER_ERROR`), not startup
- ❌ `call(procedure, input, { layer })` has no runtime to share, so it builds the layer per call

## Recommendation

**B.** It answers the human's question the way Effect does, at no measurable type cost, and the caller-owned `runtime` the handlers now take makes "once" mean once per app. Effect-native first ([`effect-native-by-default.md`](../decisions/effect-native-by-default.md)).

## Blocked until answered

- [`per-call-layers.md`](./per-call-layers.md) only matters under B.
- Plugin docs keep telling users to add a plugin's layer to their handler.

## Details

- Building in the memo map: the spike reads `Layer.CurrentMemoMap` from the runtime's context, so 3 concurrent calls across 2 procedures build the repository once and open `Db` once, and a layer the runtime also contains is still built once (memo maps key layers by reference). The core would build in `ManagedRuntime.scope` so `dispose()` releases it; the spike's scope is never closed.
- The first-release review found that a handler's own `layer` had its own memo map, so a service shared with the app's Layer graph was built twice, and `serve(handler)` didn't release it. Handlers taking a `runtime` and `makeFetchHandler` reading the Effect's context now cover both; B builds into whichever of those the call runs in.
- Not an option: a router-level `t.provide(router, layer)`. It's router-level middleware, which the human ruled out (Q6.4, "Never"), and a mapped type over the whole router.
- A per-tenant layer needs a keyed service (Effect's `LayerMap`), since a shared layer outlives the requests that use it.
