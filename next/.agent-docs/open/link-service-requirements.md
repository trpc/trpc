---
title: Should links be able to declare Effect services they need from the caller?
summary: Links' streams can't require services, so a link captures what it needs at creation; `LinkDecl` could gain `services` that every call then requires.
area: effect
recommended: B
links:
  - kind: decision
    label: effect-first-public-apis
    url: ../decisions/effect-first-public-apis.md
  - kind: decision
    label: router-client-runtime
    url: ../decisions/router-client-runtime.md
  - kind: docs
    label: Custom links
    url: https://v12.trpc.io/v12/docs/client/custom-links
  - kind: code
    label: TrpcLink, LinkDecl and link()
    url: ../../packages/trpc/src/client/link.ts
  - kind: code
    label: createEffectClient
    url: ../../packages/trpc/src/effect/index.ts
---

# Should links be able to declare Effect services they need from the caller?

## Why it matters

A link is a function returning an `OperationStream`, a `Stream<unknown, AnyTrpcError>` with no requirements. A link that needs a service (an auth token source, a tenant, `localLink`'s router services) has to capture it when it's created, as `localLink({ router, runtime })` does. On the Effect client a link can already read an optional service from the caller's fiber with `Effect.serviceOption`, but nothing types it, so a missing service is silent. Typing it means a requirements type threaded through every call's type.

## Options

### A) Keep it as it is: links capture their services

A link takes what it needs as options. On the Effect client it may read optional services from the caller's fiber, untyped.

```ts
class AuthToken extends Context.Service<
  AuthToken,
  { token: Effect.Effect<string> }
>()('AuthToken') {}

const authLink = link(({ op, next }) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const auth = yield* Effect.serviceOption(AuthToken);
      if (Option.isNone(auth)) return next(op);
      const token = yield* auth.value.token;
      return next({
        ...op,
        context: { ...op.context, headers: { authorization: token } },
      });
    }),
  ),
);

const client = createEffectClient({
  router: routerType<AppRouter>(),
  links: [authLink, httpLink({ url })],
});
const me = client.me
  .query()
  .pipe(Effect.provideService(AuthToken, { token: getToken })); // forgetting it compiles
```

- ✅ No change to the client's types, bundle or instantiations
- ✅ Works today on the Effect client (checked with a probe link and `localLink`)
- ❌ A required service can't be required: leaving it out compiles and the link runs without it
- ❌ On the Promise client there's no caller fiber, so only captured services work

### B) `LinkDecl` gains `services`

A link declares `services` as it declares `errors`. On the Effect client, every call's `Effect` and `Stream` requires them. The Promise client takes a `runtime` that provides them, required exactly when a link declares any.

```ts
const authLink = link<{ services: AuthToken }>(({ op, next }) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const token = yield* (yield* AuthToken).token;
      return next({
        ...op,
        context: { ...op.context, headers: { authorization: token } },
      });
    }),
  ),
);

const client = createEffectClient({
  router: routerType<AppRouter>(),
  links: [authLink, httpLink({ url })],
});
const me = client.me.query(); // Effect<User, …, AuthToken>
const provided = me.pipe(Effect.provideService(AuthToken, { token: getToken })); // leaving it out is a type error where the Effect runs

// Promise client
const runtime = ManagedRuntime.make(
  Layer.succeed(AuthToken, { token: getToken }),
);
const promiseClient = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [authLink, httpLink({ url })],
  runtime,
});
```

- ✅ The Effect way: what a link needs shows up in the call's type, and a missing service doesn't compile
- ✅ The same mechanism as `LinkDecl.errors`, which joins every call's error union
- ✅ `localLink` could read router services from the caller instead of a captured `runtime`
- ❌ A client-wide type change: every call type carries the links' requirements. The instantiation cost is measured with `pnpm bench shapes`.
- ❌ The Promise client gains a `runtime` option, and links' `Stream`s run with its context

## Recommendation

**B.** It's how Effect types what code needs, and it reuses the declaration links already have for `errors` and `context` ([`effect-native-by-default.md`](../decisions/effect-native-by-default.md)). Links' authoring may be Effect-first, while `createTrpcClient` and links' options keep a Promise path ([`effect-first-public-apis.md`](../decisions/effect-first-public-apis.md)). The type cost is measured before landing, and a link that declares nothing costs nothing new.

## Blocked until answered

- Nothing is blocked. `localLink` keeps its caller-owned `runtime` either way.

## Details

- From the client-and-links worker's second pass: "Should `TrpcLink` carry a requirements type, so that `localLink` or a custom link can take services from the caller's fiber? Every call type would have to thread `R`, so this is a client-wide change."
- Checked on `v12`: a link reading `Effect.serviceOption(Tenant)` sees a service provided with `Effect.provideService` on the Effect client's query, since the call's `Stream` runs in the caller's fiber.
