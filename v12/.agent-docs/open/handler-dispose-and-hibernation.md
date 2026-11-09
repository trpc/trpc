---
title: Should a fetch handler's `dispose()` also dispose the hibernation adapters made from it?
summary: After `handler.dispose()`, a Cloudflare hibernation adapter keeps its sockets open and its calls fail; the handler could dispose its adapters first.
area: platforms
recommended: B
links:
  - kind: decision
    label: cloudflare-hibernation
    url: ../decisions/cloudflare-hibernation.md
  - kind: decision
    label: handler-core-on-effect
    url: ../decisions/handler-core-on-effect.md
  - kind: docs
    label: Cloudflare
    url: https://v12.trpc.io/v12/docs/adapters/cloudflare
  - kind: code
    label: experimental_createHibernatingWebSockets
    url: ../../packages/trpc/src/cloudflare/hibernation.ts
---

# Should a fetch handler's `dispose()` also dispose the hibernation adapters made from it?

## Why it matters

`experimental_createHibernatingWebSockets(handler, { state })` makes an adapter that runs calls on the handler's services. Since the second pass, the adapter has its own `dispose()`, which ends its calls and closes the object's tRPC sockets with 1012 so clients reconnect. The handler's `dispose()` doesn't touch it. Checked on `v12`: after `handler.dispose()` with a handler-owned `layer`, the adapter keeps the socket open and every call on it fails with `INTERNAL_SERVER_ERROR` ("ManagedRuntime disposed"). A Durable Object gets no shutdown hook, so this shows up where code ends a handler itself: tests, `await using`, a handler replaced at runtime.

## Options

### A) Keep it as it is: separate lifetimes

Whoever disposes the handler disposes its adapters first.

```ts twoslash
// ---cut-start---
/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';
import { experimental_createHibernatingWebSockets } from '@trpc12/trpc/cloudflare';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { Context, Effect, type Layer } from 'effect';
interface Env {}
class Db extends Context.Service<Db, { ping: Effect.Effect<string> }>()('Db') {}
declare const AppLive: Layer.Layer<Db>;
const t = initTrpc();
const router = t.router({
  health: t.procedure.query(() =>
    Effect.gen(function* () {
      return yield* (yield* Db).ping;
    }),
  ),
});
type AppRouter = typeof router;
// ---cut-end---
const handler = createFetchHandler<AppRouter, { env: Env }>({
  router,
  layer: AppLive,
});

export class Room extends DurableObject<Env> {
  sockets = experimental_createHibernatingWebSockets(handler, {
    state: this.ctx,
  });
}
// ---cut-start---
declare const room: Room;
// ---cut-end---

// wherever the handler ends (a test, say), in this order
await room.sockets.dispose();
await handler.dispose();
```

- ✅ Each `dispose()` ends exactly what it made; nothing new to explain
- ✅ An object can end its adapter without touching a handler shared by other objects
- ❌ Forgetting the adapter leaves clients on sockets whose every call fails, with no 1012 to make them reconnect

### B) The handler's `dispose()` disposes its adapters first

Each adapter's scope joins the handler's, so `handler.dispose()` (and the end of `makeFetchHandler`'s scope) disposes every adapter made from it before releasing the services. `sockets.dispose()` still ends one adapter on its own.

```ts twoslash
// ---cut-start---
/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';
import { experimental_createHibernatingWebSockets } from '@trpc12/trpc/cloudflare';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { Context, Effect, type Layer } from 'effect';
interface Env {}
class Db extends Context.Service<Db, { ping: Effect.Effect<string> }>()('Db') {}
declare const AppLive: Layer.Layer<Db>;
const t = initTrpc();
const router = t.router({
  health: t.procedure.query(() =>
    Effect.gen(function* () {
      return yield* (yield* Db).ping;
    }),
  ),
});
type AppRouter = typeof router;
// ---cut-end---
const handler = createFetchHandler<AppRouter, { env: Env }>({
  router,
  layer: AppLive,
});

export class Room extends DurableObject<Env> {
  sockets = experimental_createHibernatingWebSockets(handler, {
    state: this.ctx,
  });
}

await handler.dispose(); // adapters first: sockets closed with 1012, then the layer
```

- ✅ The Effect model: a resource made from another lives in its scope, and closing the parent ends the child
- ✅ No adapter is left serving on released services
- ❌ The handler holds each adapter until it's disposed. An evicted object never disposes its adapter, so a module-level handler would keep one per evicted instance in the isolate, unless it holds them weakly
- ❌ A handler shared by several objects ends all their adapters at once, which is right for a shutdown but not for one object

## Recommendation

**B.** A handler's `dispose()` already ends everything it started (requests, sessions, drains), and an adapter is something it started in all but name ([`effect-internal-patterns.md`](../decisions/effect-internal-patterns.md)). The adapter's own `dispose()` stays for ending one object.

## Blocked until answered

- Nothing is blocked. The Cloudflare page documents the adapter's `dispose()` alone.
