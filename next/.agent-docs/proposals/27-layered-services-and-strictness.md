# 27 — Layered services and Effect-RPC-level strictness

| Status     | Area                          | Depends on     | oRPC parity rows |
| ---------- | ----------------------------- | -------------- | ---------------- |
| `proposed` | server, contracts, middleware | 02, 06, 07, 09 | —                |

## Summary

The human, after settling the Effect integration (one builder, services inferred into the router type, unmapped Effect failures are compile errors): "can we also layer in deps in middlewares / base procedures / plugins? can we get it as strict as Effect rpc somehow? do some research and do proposals".

Both are possible, and cheaply:

- **Layering:** a base procedure, middleware or plugin can provide a `Layer`. Its services drop out of the router's required `R`, and what the layer needs joins it. Effect builds layers once (`RpcGroup.toLayer`, `HttpApiBuilder.group`, `HttpRouter.provideRequest`) and provides per-request services through middleware. The recommendation follows that: `.provide(layer)` builds a layer once per handler, in the handler's runtime, and per-call services stay `.provide(Key, effect)` and Effect middleware.
- **Strictness:** `t.implement(contract)` already checks a procedure the way `effect/rpc` checks a handler: output from the schema, errors only those declared, every procedure present, services inferred. The recommendation adds an opt-in `.strict()` builder flag, which makes `.output()` and `.errors()` binding without a separate contract. It also lets middleware be a service with a declared shape, so contracts can declare it.

The [layered-services](../notes/layered-services-and-strictness.md) spike backs this, on the shipped package: 8 tests, and a type-check bench at 1,000 and 2,000 procedures.

## Today

- **Services are inferred** (Q2.2, [effect-integration](../decisions/effect-integration.md)). Each procedure's `services` is what its resolver's `Effect` needs minus what its builder `provided`, plus the builder's `requires`. `inferRouterServices<typeof router>` is the union, and the handler's `layer` must provide it. The handler builds `layer` once, with a `ManagedRuntime`. `call()` and `createRouterClient()` take a `layer` too.
- **Per-call providers exist:**
  - `.provide(Key, factory)` builds one service per call from a value, a `Promise` or an `Effect`. The `Effect`'s `R` joins `requires`, and its `E` must be a `TrpcError`.
  - `middleware.effect<{ provides: X }>()` types `next()` as `Effect<…, never, X>`, and `EffectBodyCheck` rejects a body that doesn't provide `X`.
  - `.concat(plugin)` and root `.concat(extension)` carry `provided` and `requires`.
- **Gaps in layering:**
  - Nothing below the handler can provide a **layer**, a service built once and shared. A plugin with a Redis-backed cache has to add `Cache` to the router's `R`, and tell every user to add `Cache.layer` to their handler. `.provide(Cache, effect)` would rebuild it on every call.
  - A middleware's implementation is written inline with its declaration. Swapping it for a test means rebuilding the procedures. `effect/rpc` splits the two: a key declares `provides` and `error`, and a layer implements it.
  - Routers are plain objects, so a sub-router can't provide anything to its procedures; base procedures do that.
- **Strictness today:**
  - Q2.3: an `Effect` failure that isn't a `TrpcError` is a compile error.
  - `.output(schema)` constrains the resolver's return (`OutputConstraint`).
  - `.errors()` declares errors with typed constructors, but an undeclared error still joins the inferred union.
  - Contracts: `experimental_contract…errors().query()` and `t.implement(contract)` reject undeclared errors (`UndeclaredCheck`), wrong outputs, missing keys and extra keys (`ImplementedRouter`, `ExactRouter`, `checkImplementation` at runtime), and an implementer-wide `.use()` whose errors some leaf doesn't declare (`EveryLeafDeclares`). Contracts don't declare middleware.
  - The "Thrown errors + exhaustive declarations" work, which isn't on `v12` yet, types thrown errors and checks that every declared error can happen.
- **Effect 4**, read from the installed `effect@4.0.2` source:
  - `effect/rpc`: `RpcMiddleware.Service<Self, { provides?, requires?, clientError? }>()(id, { error?, requiredForClient? })`. Its value is `(effect: Effect<SuccessValue, E | unhandled, Provides>, { client, requestId, rpc, payload, headers }) => Effect<SuccessValue, unhandled | E, Requires | Scope>`, given by a layer. A handler's `R` is `Exclude<R, Provides> | Requires`. `group.toLayer(Effect<handlers, EX, RX>)` builds the handlers once, so what the `Effect` yields is shared. `HandlersFrom` requires every Rpc, and `ResultFrom` allows only the declared `success` and `error`.
  - `effect/http-api`: the same, with `HttpApiMiddleware.Service` and errors in `HttpApiEndpoint.get(name, path, { error })`. `HttpApiBuilder.group` rejects a group with an endpoint not handled.
  - `effect/http`: `HttpRouter.middleware<{ provides }>()` is a layer built once, and `HttpRouter.provideRequest(layer)` builds `layer` once and provides it to every request.

| What                                    | tRPC today                            | `effect/rpc`                       | `effect/http-api`                   | `HttpRouter`                    |
| --------------------------------------- | ------------------------------------- | ---------------------------------- | ----------------------------------- | ------------------------------- |
| Shared (built-once) dependencies        | the handler's `layer` only            | `toLayer(Effect<handlers>)`        | `HttpApiBuilder.group(…, Effect)`   | `provideRequest(layer)`, layers |
| Per-request services                    | `.provide(Key, f)`, Effect middleware | middleware `provides`              | middleware `provides`               | middleware `provides`           |
| Middleware declared apart from its code | no                                    | `RpcMiddleware.Service` + layer    | `HttpApiMiddleware.Service` + layer | layer                           |
| Errors declared                         | `.errors()`, optional                 | `Rpc.make(…, { error })`, required | `HttpApiEndpoint.get(…, { error })` | none (responses)                |
| Handler fails only with declared errors | contracts only                        | yes                                | yes                                 | —                               |
| Output checked against a schema         | with `.output()`                      | yes                                | yes                                 | —                               |
| Every procedure implemented             | contracts only (types and runtime)    | yes (`HandlersFrom`)               | yes (`ValidateReturn`)              | —                               |
| Services inferred                       | yes                                   | yes                                | yes                                 | yes (`Request` markers)         |
| Every declared error reachable          | not yet (the sibling work)            | no                                 | no                                  | —                               |

## Goals

- A base procedure, middleware or plugin can bring its own layer, so its services stop being the app's problem, while what that layer needs still reaches the handler's `layer` check.
- Shared services are built once, shared with the handler's `layer`, and released by `dispose()`.
- Opt-in strictness as tight as `effect/rpc`'s, with inference staying the default.
- Effect-native shapes ([effect-native-by-default](../decisions/effect-native-by-default.md)), with no client bundle cost and no type-check cost for apps that don't opt in.

## Non-goals

- Declared services on `t` (S2). Q2.2 chose inference, and `effect/rpc` infers services too.
- Typing thrown errors and exhaustive `.errors()`: that's the "Thrown errors + exhaustive declarations" work. A strict mode builds on whatever it lands.
- Router-level middleware: Q6 settled on base procedures ([middleware](../decisions/middleware.md)).

## Options

### P1 — `.provide(layer)`: a layer from a base procedure, middleware or plugin (Q27.1, Q27.2)

```ts
class PostRepo extends Context.Service<
  PostRepo,
  { find(id: string): Effect.Effect<Post> }
>()('PostRepo') {
  static readonly layer = Layer.effect(
    PostRepo,
    Effect.gen(function* () {
      const db = yield* Db;
      return { find: (id) => db.query(/* … */) };
    }),
  );
}

const withRepo = t.procedure.provide(PostRepo.layer); // Layer<PostRepo, never, Db>

export const router = {
  post: {
    byId: withRepo
      .input(Schema.Struct({ id: Schema.String }))
      .query(({ input }) =>
        Effect.flatMap(PostRepo, (repo) => repo.find(input.id)),
      ),
  },
};

// inferRouterServices<typeof router> is Db: PostRepo is provided, what its layer needs isn't
createFetchHandler({ router, layer: Db.layer });

// A plugin brings its own layer the same way
export const cached = initTrpc().procedure.provide(
  Cache.layer.pipe(Layer.provide(RedisLive)),
);
const app = t.procedure.concat(cached);
```

- It's an overload of today's `.provide(Key, factory)`: one argument that is a `Layer`. The builder state gets `provided | ROut` and `requires | Exclude<RIn, provided>`. The prototype (`provideLayer`) shows the types hold, and that a handler `layer` missing `Db` is a compile error.
- **Built once per handler**, the first time a procedure that provides it runs. It's built in the handler runtime's `MemoMap` (`ManagedRuntime.memoMap`, which the runtime's context exposes as `Layer.CurrentMemoMap`), so every procedure that provides the same layer value shares one instance. The handler's `layer` shares it too if it contains the same layer, because memo maps key layers by reference. The spike measures this: 3 concurrent calls across 2 procedures build the repository once and open `Db` once.
- **Released by `dispose()`:** the core builds it in `ManagedRuntime.scope`. The spike uses a scope per memo map that's never closed.
- **A build failure is a defect**, as a failing handler `layer` is today: the call fails with a masked `INTERNAL_SERVER_ERROR`, and the next call tries again.
- `call()` has no handler runtime, so it builds the layer per call, with the call's own `layer`.

**Sub-option, Q27.2: per-call layers.** `{ lifetime: 'call' }` would build the layer per call, in a `MemoMap` forked from the handler's. Effect 4's `Effect.provide(layer)` already does this: it reuses what the handler built and releases the rest when the call ends. The prototype runs `tx 1 begin`, `tx 1 end`, `tx 2 begin`, `tx 2 end`, with `db open` once. The layer's errors would have to be `TrpcError`s and would join the procedure's errors. The same thing already works without new API:

```ts
const withTx = t.procedure.use(
  t.middleware.effect<{ provides: Tx }>()(({ next }) =>
    next().pipe(Effect.provide(Tx.layer)),
  ),
);
```

Both forms end the call's scope when the resolver's `Effect` ends, which is before a streamed output is read. That would have to be fixed before a per-call scope can hold a streamed procedure's resources.

**Not an option: router-level provide.** `t.provide(router, layer)` would be router-level middleware, which Q6.4 ruled out ("Never", [middleware](../decisions/middleware.md)). It would also be a runtime walk plus a mapped type over the whole router, the costliest shape on large routers ([large-routers](../decisions/large-routers.md)). Base procedures do it instead.

- ✅ It's what the human asked for, the Effect way: built once, like `toLayer` and `provideRequest`. Plugins become self-contained.
- ✅ The type cost is negligible: +8 instantiations per procedure (+3%). Bundle: about 0.4 KB gzip on the server, none on the client.
- ✅ No new concept: it's `.provide()` with a layer, and the rest is how `ManagedRuntime` and memo maps already behave.
- ❌ Two lifetimes in one method name: `.provide(Key, f)` runs per call and `.provide(layer)` once. The JSDoc has to say so, and Q27.2 is about whether to add a third.
- ❌ A shared layer's resources outlive the requests that use them, so a per-tenant layer needs a keyed service instead (Effect's `LayerMap`).
- ❌ Lazy building means a broken layer surfaces on the first call that needs it, not at startup. Building eagerly would mean walking the router, and `lazy()` routers make that impossible.

### P2 — middleware as an Effect service (Q27.3)

The `RpcMiddleware` and `HttpApiMiddleware` shape: a key declares what the middleware provides, what it fails with and what ctx it reads, and a layer implements it.

```ts
class Auth extends Context.Service<
  Auth,
  MiddlewareImpl<CurrentUser, TrpcError<'UNAUTHORIZED'>, { token?: string }>
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
createFetchHandler({
  router,
  layer: Layer.mergeAll(AuthLive, SessionsLive, Db.layer),
});
```

- The prototype is `useService(builder, Key)`: `next` is an opaque `Effect<Next, never, Provides>`, `Provides` drops out, the key joins `requires`, the declared error joins the procedure's errors, and a procedure without the ctx the middleware reads is a compile error. `AuthLive` is built once per handler.
- The shipped version would be an overload of `.use()` that takes a key; the middleware function, plugin and extension forms are already overloads ([use-overloads](../notes/use-overloads.md)).
- It works today as a pattern: an Effect middleware whose body yields the key and calls it. P2 is a type (`MiddlewareImpl`) and a `.use()` overload on top of that.

- ✅ Effect-native, and the same shape as `effect/rpc` and `effect/http-api` middleware: tests swap `AuthLive` for a fake layer, and the procedures stay the same.
- ✅ The middleware's own dependencies are built once, with its layer, rather than per call.
- ✅ Contracts can declare it (P4), because the key carries its full type without its implementation.
- ✅ The type cost is zero (−0.3% instantiations). Bundle: about 0.2 KB gzip on the server.
- ❌ It's a second way to write middleware. Inline middleware stays the simple form.
- ❌ The implementation reads `ctx` through an object type on the key, not through the procedure's inferred ctx. `.use()` checks it, but the key's author has to write that type.

### P3 — strict procedures: `.strict()` (Q27.4)

An opt-in flag, inherited by everything built from it, that makes declarations binding the way `effect/rpc` does:

```ts
const strict = t.procedure.strict(); // a base procedure, or initTrpc<…>({ strict: true })

export const byId = strict
  .use(Auth) // its declared UNAUTHORIZED counts as declared
  .input(Schema.Struct({ id: Schema.String }))
  .output(Post)
  .errors({ NOT_FOUND: { data: Schema.Struct({ id: Schema.String }) } })
  .query(({ input, errors }) =>
    Effect.flatMap(PostRepo, (repo) => repo.find(input.id)).pipe(
      Effect.catchTag('NoSuchElementError', () =>
        Effect.fail(errors.NOT_FOUND({ data: input })),
      ),
    ),
  );

strict.query(() => 'x');
//     ~~~~~ strict: declare the output with .output()
strict.output(Post).query(() => new TrpcError.Forbidden());
//                         ~~~~~~~~~~~~~~~~~~~~~~~~~~~ FORBIDDEN is not declared; add it with .errors()
```

- What it checks:
  - The output is declared, and the resolver returns it.
  - The resolver fails only with declared errors, its middleware's included. This is the contract's `UndeclaredCheck`.
  - Q2.3 still applies.
  - Services stay inferred.
- The prototype is `strict(builder)`, a wrapper with those checks on `query` and `mutation`. A shipped flag (`TDef['strict']`) would gate the same check, so non-strict procedures pay one conditional.
- Exhaustiveness (every declared error reachable) belongs to the sibling's `.errors()` work. `effect/rpc` doesn't check it.

- ✅ `effect/rpc`'s strictness without a separate contract file, opt-in per base procedure, so an app can make only its public API strict.
- ✅ It reuses the contract's checks and messages, with the wording changed.
- ✅ Zero bundle cost: it's types, plus a flag.
- ❌ Type-check cost for strict procedures: +30% instantiations over `.output()` + `.errors()` (305 per procedure), about +0.15 ms per procedure (1.38 s → 1.53 s at 1,000 procedures). Declaring is the larger cost: Effect Schema outputs and error data take 140 → 906 instantiations per procedure, in any declared mode.
- ❌ Wrong-output messages are poor, as they are for `.output()` today: "Property 'id' is missing in type Effect<…>".
- ❌ A third mode beside inferred and contract, to document.

### P4 — contracts as the strict path, with middleware declared (Q27.5)

Contracts already are `effect/rpc`'s model: a declaration (`RpcGroup`, here the contract), checked against an implementation (`toLayer`, here `t.implement`). The gap is middleware. A contract lists `UNAUTHORIZED` in `.errors()` and can't say a procedure is authenticated. `Rpc.middleware(M)` puts the middleware in the declaration, so both its errors and the client's `requiredForClient` follow from it. With P2's keys, contracts can do the same:

```ts
const c = experimental_contract.create();
export const appContract = {
  me: c.use(Auth).output(User).query(), // errors: UNAUTHORIZED, from Auth's type
};

const impl = t.implement(appContract); // every leaf under c.use(Auth) gets Auth
export const router = impl.router({
  me: impl.me.query(() => CurrentUser), // CurrentUser is provided
});
// inferRouterServices<typeof router> includes Auth: the handler's layer gives AuthLive
```

- A contract that declares a middleware imports only its key (a type and a string id), so a client importing the contract doesn't pull in the implementation.
- An optional extra: a frozen contract. `experimental_toContract(router)` already derives a JSON contract, and a test can compare it with a committed one, which catches unreviewed surface changes (a new error, a widened output) in an inferred router. It's left open here.

- ✅ It's how `effect/rpc` and `effect/http-api` do it, and contracts already have the checks: a contract plus `t.implement` is as strict as `toLayer`.
- ✅ Declared middleware gives typed client errors and documented auth (OpenAPI security from the key's meta, later).
- ✅ Zero bundle cost on the client.
- ❌ It depends on P2.
- ❌ Contracts cost more to check than `strict`: about 50% more instantiations than declaring in the builder (1,426 per procedure against 906), and about the same check time as `strict`.
- ❌ Two files per API, the trade-off contracts always make.

## Type-check and bundle cost

Medians of 3 `tsc` runs (TypeScript 7.0.2), on the shipped package, at 20 services and 10 procedures per file. Every fixture includes the package and the prototypes (91,364 instantiations at n=0). Method and raw numbers: [the note](../notes/layered-services-and-strictness.md).

| Variant                                            | Instantiations / procedure | Check time, 1,000 procedures | 2,000 procedures |
| -------------------------------------------------- | -------------------------: | ---------------------------: | ---------------: |
| inferred (today)                                   |                        140 |                        0.33s |            0.48s |
| P1 `.provide(layer)` on a base procedure           |                        148 |                        0.36s |            0.49s |
| P2 middleware as a service                         |                        140 |                        0.32s |            0.47s |
| `.output(Schema)`                                  |                        576 |                        0.89s |            1.67s |
| `.output(Schema)` + `.errors()`                    |                        906 |                        1.38s |            2.66s |
| P3 `strict` (+ the same declarations)              |                      1,211 |                        1.53s |            3.12s |
| P4 contract + `t.implement`                        |                      1,426 |                        1.56s |            2.98s |
| Exhaustive `.errors()` (sibling, 1,500 procedures) |         +22% over declared |               ≈ +0.1 ms each |                  |

Bundle, minified and gzipped with `effect` and `@trpc12/trpc` external: P1 379 B, P2 163 B, P3 63 B, all on the server. No option changes the client bundle.

## Recommendation

- **P1, built once per handler** (Q27.1 A). It answers "layer in deps" the way Effect does, at no type cost. Building in the handler runtime's memo map and scope means one instance, shared with the handler's `layer`, and released by `dispose()`.
- **No per-call lifetime yet** (Q27.2 A). Effect middleware with `Effect.provide(layer)` and `.provide(Key, effect)` already cover per-call, and a per-call scope needs to span streamed outputs first.
- **P2 as an experimental `.use(Key)`** (Q27.3 A). It's `effect/rpc`'s middleware shape, it costs nothing, and P4 needs it.
- **P3 `.strict()` as an opt-in base-procedure flag** (Q27.4 A). This is "as strict as Effect rpc" for builder users, paid for only by the procedures that opt in.
- **P4: contracts declare middleware** (Q27.5 A), so a contract is a full `RpcGroup`.
- **Given up:** declared services (S2), eager layer building, router-level provide (Q6.4), and per-tenant layers (Effect's `LayerMap`, a keyed service, covers those).

## Questions

- **Q27.1** Can a base procedure, middleware or plugin provide a `Layer`, and when is it built? A: `.provide(layer)`, built once per handler, in its runtime. B: no; services go in the handler's `layer` only. C: something else.
- **Q27.2** Should there be per-call layers? A: no; use Effect middleware with `Effect.provide(layer)`, or `.provide(Key, effect)`. B: `.provide(layer, { lifetime: 'call' })`, once streamed outputs keep the call's scope open.
- **Q27.3** Should middleware be declarable as an Effect service? A: an experimental `.use(Key)` with `MiddlewareImpl`, implemented by a layer. B: no; document the pattern of an Effect middleware that yields its implementation.
- **Q27.4** How should a procedure opt into `effect/rpc`-level strictness? A: a `.strict()` flag on a base procedure (or the root), which requires `.output()` and allows only declared errors. B: contracts only. C: something else.
- **Q27.5** Should contracts declare middleware? A: yes, `c.use(Key)`, which adds its errors and makes `t.implement` require its key. B: no; contracts list middleware errors in `.errors()`.

## Decision

> Human: tick an answer per question (or write your own), add notes, and set **Status** to `accepted`.
> The agent then records it in `../decisions/` and links back here.

- **Q27.1:** [ ] A · [ ] B · [ ] C
- **Q27.2:** [ ] A · [ ] B
- **Q27.3:** [ ] A · [ ] B
- **Q27.4:** [ ] A · [ ] B · [ ] C
- **Q27.5:** [ ] A · [ ] B
- **Notes:**
