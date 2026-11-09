---
title: Should middleware be declarable as an Effect service, with `.use(Key)` and a layer that implements it?
summary: Middleware is written inline with its declaration. A key plus a layer, like `effect/rpc`'s `RpcMiddleware`, would let tests and contracts swap it.
area: effect
recommended: B
questions: [Q27.3]
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
    label: effect-middleware-next
    url: ../decisions/effect-middleware-next.md
  - kind: note
    label: layered-services spike
    url: ../notes/layered-services-and-strictness.md
  - kind: docs
    label: Effect, Middleware that provides services
    url: https://v12.trpc.io/v12/docs/server/effect#middleware-that-provides-services
---

# Should middleware be declarable as an Effect service, with `.use(Key)` and a layer that implements it?

## Why it matters

A middleware's implementation is written with its declaration, so swapping auth for a fake in tests means rebuilding the procedures, and its dependencies are read per call. `effect/rpc` and `effect/http-api` split the two: a key declares what the middleware provides and how it fails, and a layer, built once, implements it. Effect middleware's `next()` now fails with the downstream error as `RpcMiddleware`'s does ([`effect-middleware-next.md`](../decisions/effect-middleware-next.md)), which settled `next()`'s shape but not this.

## Options

### A) Keep it as it is: an Effect middleware that calls a service

The pattern works today: the middleware yields its implementation from a service the app provides.

```ts twoslash
// ---cut-start---
import { createFetchHandler, initTrpc, TrpcError } from '@trpc12/trpc/server';
import { Context, Effect, Layer } from 'effect';
import type { User } from './server.ts';
const t = initTrpc<{ ctx: { token?: string } }>();
class CurrentUser extends Context.Service<CurrentUser, User>()('CurrentUser') {}
class Db extends Context.Service<Db, {}>()('Db') {
  declare static readonly layer: Layer.Layer<Db>;
}
// ---cut-end---
class Auth extends Context.Service<
  Auth,
  { verify(token?: string): Effect.Effect<User, TrpcError<'UNAUTHORIZED'>> }
>()('Auth') {}

const authed = t.procedure.use(
  t.middleware.effect<{ provides: CurrentUser }>()((opts) =>
    Effect.gen(function* () {
      const user = yield* (yield* Auth).verify(opts.ctx.token);
      return yield* opts.next().pipe(Effect.provideService(CurrentUser, user));
    }),
  ),
);
// ---cut-start---
declare const AuthLive: Layer.Layer<Auth>;
const router = t.router({
  me: authed.query(() =>
    Effect.gen(function* () {
      return yield* CurrentUser;
    }),
  ),
});
// ---cut-end---

createFetchHandler({ router, layer: Layer.mergeAll(AuthLive, Db.layer) });
```

- ✅ Built and documented; one way to write middleware
- ✅ Tests swap `AuthLive` already, as long as the logic sits in the service
- ❌ Each app invents the split; nothing standard for contracts or plugins to name
- ❌ The declaration (what it provides, how it fails) lives in the middleware body, not on a key

### B) `.use(Key)`: the key declares, a layer implements

An experimental `MiddlewareImpl<Provides, E, Ctx>` type and a `.use()` overload that takes a key.

```ts twoslash
// ---cut-start---
import { createFetchHandler, initTrpc, TrpcError } from '@trpc12/trpc/server';
import { Context, Effect, Layer, Option } from 'effect';
import type {
  experimental_MiddlewareImplB as experimental_MiddlewareImpl,
  WithUseKeyB,
} from '../open/middleware-as-service.ts';
import type { User } from './server.ts';
const t0 = initTrpc<{ ctx: { token?: string } }>();
declare const t: WithUseKeyB<typeof t0>;
class CurrentUser extends Context.Service<CurrentUser, User>()('CurrentUser') {}
class Sessions extends Context.Service<
  Sessions,
  { find: (token?: string) => Option.Option<User> }
>()('Sessions') {}
declare const SessionsLive: Layer.Layer<Sessions>;
class Db extends Context.Service<Db, {}>()('Db') {
  declare static readonly layer: Layer.Layer<Db>;
}
// ---cut-end---
class Auth extends Context.Service<
  Auth,
  experimental_MiddlewareImpl<
    CurrentUser,
    TrpcError<'UNAUTHORIZED'>,
    { token?: string }
  >
>()('Auth') {}

const AuthLive = Layer.effect(
  Auth,
  Effect.gen(function* () {
    const sessions = yield* Sessions; // built once, with the layer
    return (next, { ctx }) =>
      Option.match(sessions.find(ctx.token), {
        onNone: () => Effect.fail(new TrpcError.Unauthorized()),
        onSome: (user) => next.pipe(Effect.provideService(CurrentUser, user)),
      });
  }),
);

const authed = t.procedure.use(Auth); // provides CurrentUser, requires Auth, adds UNAUTHORIZED
// ---cut-start---
const router = t.router({
  me: authed.query(() =>
    Effect.gen(function* () {
      return yield* CurrentUser;
    }),
  ),
});
// ---cut-end---
createFetchHandler({
  router,
  layer: Layer.mergeAll(AuthLive, Db.layer).pipe(Layer.provide(SessionsLive)),
});
```

- ✅ The shape of `RpcMiddleware` and `HttpApiMiddleware`: tests swap the layer, procedures stay the same, and the middleware's own dependencies are built once
- ✅ The key carries the full type without its code, so contracts can declare it ([`contracts-declare-middleware.md`](./contracts-declare-middleware.md))
- ✅ Measured: no type cost (−0.3% instantiations), about 0.2 KB gzip on the server
- ❌ A second way to write middleware beside the inline form
- ❌ The key's author writes the ctx type it reads; `.use()` checks it against the procedure

## Recommendation

**B**, as experimental. It's Effect's own middleware shape at no type cost, and it's what lets a contract say a procedure is authenticated. Inline middleware stays the simple form. Effect-native first ([`effect-native-by-default.md`](../decisions/effect-native-by-default.md)); router and procedure declaration stay usable without Effect ([`effect-first-public-apis.md`](../decisions/effect-first-public-apis.md)), since this is an extra overload.

## Blocked until answered

- [`contracts-declare-middleware.md`](./contracts-declare-middleware.md) needs B.

## Details

The spike's `useService(builder, Key)` is the prototype: `next` is an opaque `Effect<Next, NextError, Provides>`, `Provides` drops out of the router's services, the key joins them, the declared error joins the procedure's errors, and a procedure without the ctx the middleware reads is a compile error. In the spike's test, `AuthLive` builds once for two clients sharing a runtime.
