---
title: Should a handler's `createContext` be allowed to return an `Effect`?
summary: "`createContext` returns a value or a Promise; returning an `Effect` would let it read the handler's services and fail with a typed `TrpcError`."
area: effect
recommended: B
links:
  - kind: decision
    label: effect-first-public-apis
    url: ../decisions/effect-first-public-apis.md
  - kind: decision
    label: handler-core-on-effect
    url: ../decisions/handler-core-on-effect.md
  - kind: docs
    label: Context
    url: https://v12.trpc.io/v12/docs/server/context
  - kind: docs
    label: Effect on the server
    url: https://v12.trpc.io/v12/docs/server/effect
  - kind: code
    label: ContextOption and CreateContextOpts
    url: ../../packages/trpc/src/server/handler/fetch.ts
  - kind: code
    label: localLink's createContext
    url: ../../packages/trpc/src/client/links/local.ts
---

# Should a handler's `createContext` be allowed to return an `Effect`?

## Why it matters

`createContext` (on `createFetchHandler`, the OpenAPI and v11 handlers, and `localLink`) returns `MaybePromise<TCtx>`. Inside, the handler already runs it as an Effect (`makeContext`), with the call's signal. An Effect app that builds `ctx` from a service, such as a session store, has to run that service by hand through a runtime, or move the work into `.provide()` or an Effect middleware on every procedure.

## Options

### A) Keep it as it is: a value or a Promise

Effect users run their service through the `runtime` they also pass to the handler, or read it later in Effect middleware.

```ts twoslash
// ---cut-start---
import { createFetchHandler } from '@trpc12/trpc/server';
import { Context, Effect, ManagedRuntime, type Layer } from 'effect';
import { appRouter as router, type User } from './server.ts';
class Sessions extends Context.Service<
  Sessions,
  { fromCookie: (cookie: string | undefined) => Effect.Effect<User | null> }
>()('Sessions') {
  declare static readonly layer: Layer.Layer<Sessions>;
}
// ---cut-end---
const runtime = ManagedRuntime.make(Sessions.layer);

const handler = createFetchHandler({
  router,
  runtime,
  createContext: async ({ request }) => ({
    user: await runtime.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Sessions).fromCookie(request.headers.cookie);
      }),
    ),
  }),
});
```

- ✅ One shape for every handler and `localLink`, no type change
- ✅ What fails is still the call's error: a thrown `TrpcError` is sent as it is
- ❌ A second way into the services beside the handler's own, and the Effect isn't interrupted with the request
- ❌ With a handler-owned `layer`, `createContext` can't reach its services at all

### B) `createContext` may also return an `Effect`

The Effect runs in the request's fiber with the handler's services. It may fail with a `TrpcError`, which is the call's error. Promise and plain returns work as before.

```ts twoslash
// ---cut-start---
import { Context, Effect, Layer } from 'effect';
import { z } from 'zod';
import { createFetchHandlerB as createFetchHandler } from '../open/create-context-as-effect.ts';
import { t, type Post, type User } from './server.ts';
class Sessions extends Context.Service<
  Sessions,
  { fromCookie: (cookie: string | undefined) => Effect.Effect<User | null> }
>()('Sessions') {
  declare static readonly layer: Layer.Layer<Sessions>;
}
class PostRepo extends Context.Service<
  PostRepo,
  { find: (id: string) => Effect.Effect<Post | undefined> }
>()('PostRepo') {
  declare static readonly layer: Layer.Layer<PostRepo>;
}
const router = t.router({
  post: {
    byId: t.procedure.input(z.object({ id: z.string() })).query((opts) =>
      Effect.gen(function* () {
        return yield* (yield* PostRepo).find(opts.input.id);
      }),
    ),
  },
});
// ---cut-end---
const handler = createFetchHandler({
  router,
  layer: Layer.mergeAll(PostRepo.layer, Sessions.layer),
  createContext: ({ request }) =>
    Effect.gen(function* () {
      const user = yield* (yield* Sessions).fromCookie(request.headers.cookie);
      return { user };
    }),
});
```

- ✅ The services come from the same place as the procedures', and the Effect is interrupted with the request
- ✅ Promise users write what they write today
- ❌ `ContextOption` gains an `Effect` branch with its own requirements, which must join what the `layer` or `runtime` provides: one more type parameter on each handler, measured with `pnpm bench shapes`
- ❌ `localLink`'s `createContext` and `createRouterClient`'s `ctx` function should follow, to keep one rule

## Recommendation

**B.** The handler already runs `createContext` as an Effect; letting it return one gives Effect apps one place for their services, without changing anything for Promise users ([`effect-native-by-default.md`](../decisions/effect-native-by-default.md)). `createContext` keeps its Promise path, as [`effect-first-public-apis.md`](../decisions/effect-first-public-apis.md) requires. The type cost is measured before landing.

## Blocked until answered

- Nothing is blocked. The context docs describe A.

## Details

- This also covers the client-and-links worker's question on `localLink`'s `createContext` as an Effect, which it said "only makes sense together with the server handlers' `createContext`".
- `makeContext` in `server/handler/core.ts` maps a thrown `TrpcError` to the call's error and anything else to an unexpected one. B would add a typed failure channel with the same mapping.
