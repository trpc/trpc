# Layered services and Effect-RPC-level strictness

- **Date:** 2026-10-18
- **Question:** the human, after the Effect integration round: "can we also layer in deps in middlewares / base procedures / plugins? can we get it as strict as Effect rpc somehow? do some research and do proposals". Can a base procedure, middleware or plugin provide a `Layer` so its services drop out of the router's required `R`? And what would checking a procedure against declared outputs and errors, as `effect/rpc` checks a handler against its `Rpc`, cost?
- **Feeds:** [proposal 27](../proposals/27-layered-services-and-strictness.md), [effect-integration](../decisions/effect-integration.md), [contracts](../decisions/contracts.md).
- **Code:** [`next/spikes/layered-services/`](../../spikes/layered-services/), on the shipped `@trpc12/trpc`:
  - `layer.ts`: `provideLayer(builder, layer, { lifetime })`, the P1 prototype, as an Effect middleware.
  - `middleware-service.ts`: `useService(builder, Key)` and `MiddlewareImpl`, the P2 prototype (the `RpcMiddleware` shape).
  - `strict.ts`: `strict(builder)`, the P3 prototype, with the contract's `UndeclaredCheck`.
  - `layered-services.test.ts`: 8 runtime and type tests, run by `pnpm test`.
  - `generate.ts` and `bench.ts`: the type-check bench.
- **Versions:** effect 4.0.2, TypeScript 7.0.2, Node 24.21.

## How Effect 4 does it

Read from the installed `effect@4.0.2` source (`effect/rpc`, `effect/http-api`, `effect/http`), not Effect 3 docs.

- **`effect/rpc`** (`rpc/RpcMiddleware.ts`, `rpc/RpcGroup.ts`, `rpc/Rpc.ts`):
  - A middleware is a service key: `RpcMiddleware.Service<Self, { provides?, requires?, clientError? }>()(id, { error?, requiredForClient? })`.
  - Its implementation is the key's value, given by a layer: `(effect: Effect<SuccessValue, E | unhandled, Provides>, { client, requestId, rpc, payload, headers }) => Effect<SuccessValue, unhandled | E, Requires | Scope>`. The layer is built once; the function runs per request and provides `Provides` around the handler.
  - `rpc.middleware(M)` or `group.middleware(M)` attach it. The handler's `R` becomes `Exclude<R, Provides<M>> | Requires<M>` (`ApplyServices`), and `M` itself is required by the server.
  - Handlers are a layer: `group.toLayer(handlers | Effect<handlers, EX, RX>)` is `Layer<ToHandler<R>, EX, Exclude<RX, Scope> | HandlersServices<R, Handlers>>`. What the `Effect` yields (repositories, clients) is built once, with the layer; what a handler's own `Effect` needs is required per call, minus what middleware provides.
  - Strictness: `HandlersFrom<R>` is a mapped type, so every Rpc needs a handler; `ResultFrom` is `Effect<Success | …, Error, Services>`, so a handler fails only with its Rpc's declared `error` schema (and the middleware's), and succeeds with its `success` schema. Services are inferred. Nothing checks that every declared error can happen.
- **`effect/http-api`** (`http-api/HttpApiMiddleware.ts`, `http-api/HttpApiBuilder.ts`): the same shape. `HttpApiMiddleware.Service<Self, { provides?, requires? }>()(id, { error?, security? })`, implemented as `(httpEffect: Effect<HttpServerResponse, unhandled, Provides>, { endpoint, group }) => Effect<…, unhandled | E, Requires | HttpRouter.Provided>`. Errors are declared per endpoint in `HttpApiEndpoint.get(name, path, { error })` (there is no `.addError` in Effect 4). `HttpApiBuilder.group(api, name, (handlers) => …)` builds a group's layer once; `handle(name, …)` refuses a name already handled, and the group's layer is only accepted once every endpoint is.
- **`effect/http` `HttpRouter`** (`http/HttpRouter.ts`): middleware is a layer, `HttpRouter.middleware<{ provides, handles }>()(effect)`, built once, possibly from an `Effect` with its own requirements. Routes declare per-request requirements as `Request<"Requires", X>` markers, which middleware with `provides: X` removes. `HttpRouter.provideRequest(layer)` builds `layer` once (`Layer.build` inside the middleware's construction) and provides the result to every request.

So Effect's rule is: **layers are built once, and per-request services come from middleware that provides them.** Nothing in Effect builds a layer per request, except a middleware that calls `Effect.provide(layer)` itself.

## Results: layering

8 tests pass (`pnpm exec vp test run --watch false spikes/layered-services`) and the spikes type-check.

- **A base procedure can provide a layer.** `provideLayer(t.procedure, PostRepoLive)` provides `PostRepo` to every procedure built from it. `PostRepo` drops out of `inferRouterServices`, and what `PostRepoLive` needs (`Db`) joins it. A handler `layer` that lacks `Db` is a compile error. A middleware or a plugin made with `.concat()` carries it the same way, since `provided` and `requires` are already in `BuilderDef`.
- **Handler lifetime works through the runtime's memo map.** The prototype builds the layer in `Layer.CurrentMemoMap`, which `ManagedRuntime` puts in its context. Three concurrent calls across two procedures build `PostRepoLive` once and open `Db` once. If the handler's own `layer` also contains `PostRepoLive`, it's still built once: memo maps key layers by reference.
- **Call lifetime works through `Effect.provide`.** Effect 4's `Effect.provide(layer)` forks the current memo map (`forkMemoMapUnsafe`; lookups fall back to the parent), so a per-call `TxLive` reuses the handler's `Db` and releases its transaction when the call ends (`tx 1 begin`, `tx 1 end`, `tx 2 begin`, `tx 2 end`; `db open` once).
- **Layer errors.** A call-lifetime layer can only fail with a `TrpcError`, which joins the procedure's errors (a layer failing with `Error` is a compile error, per Q2.3). A handler-lifetime layer's failure is a defect, as the handler's `layer` is today.
- **Middleware as a service works.** `useService(t.procedure, Auth)`, where `Auth` is a `Context.Service` whose value is a `MiddlewareImpl<CurrentUser, TrpcError<'UNAUTHORIZED'>, { token?: string }>`: `CurrentUser` is provided, `Auth` is required, `UNAUTHORIZED` joins the procedure's errors, and `AuthLive` (which needs `Sessions`) is built once per handler. A procedure that lacks the ctx the middleware reads is a compile error.
- **Limits of the prototypes.** The handler-lifetime scope isn't closed by `dispose()` (the core would pass `ManagedRuntime.scope`). A call-lifetime scope ends when the resolver's `Effect` does, before a streamed output is read. `call()` has no handler runtime, so a handler-lifetime layer falls back to a module-level memo map. Each `createRouterClient` is its own runtime, so it builds its own copy.

## Results: strictness

- **Contracts are already as strict as `effect/rpc`.** `t.implement(contract)` checks each resolver's output against the contract (`ResultConstraint`), its errors against the declared ones (`UndeclaredCheck`: "The contract does not declare this error"), every key present and no extra ones (`ImplementedRouter`, `ExactRouter`, plus `checkImplementation` at runtime), and that an implementer-wide `.use()` only adds errors every leaf declares (`EveryLeafDeclares`). Services stay inferred, as in `effect/rpc`.
- **The plain builder is looser in four places:**
  - Errors that aren't declared with `.errors()` still join the inferred union, so nothing reviews a new failure.
  - Without `.output()`, an `any` output passes.
  - Middleware errors are inferred, not declared.
  - Thrown errors are untyped, which the "Thrown errors + exhaustive declarations" work is changing.
- **`strict(builder)` closes the first three per procedure.** It requires `.output()` ("strict: declare the output with .output()"), rejects undeclared errors with the contract's check, and keeps Q2.3's unmapped-failure check. The middleware's declared errors (`UNAUTHORIZED` from `useService`) count as declared. The error message names the contract; a shipped version would have its own.
- **Error messages for a wrong output are poor**, as they are for the shipped `.output()`: `{ id: 1 }` against `{ id: string }` reports "Property 'id' is missing in type Effect<…>". This comes from the `Value | Effect<Value>` union constraint.

## Type-check cost

`node layered-services/bench.ts <n> 3` from `next/spikes`: medians of 3 `tsc --extendedDiagnostics --singleThreaded` runs. Each fixture has 20 services, 10 procedures per file, and a third of the procedures behind an auth middleware that provides `CurrentUser`. A fetch handler checks its `layer`. Log: `/opt/cursor/artifacts/layered-services-bench.log`.

| Variant              | What it adds                                        | Instantiations, n=1000 |    n=2000 | Per procedure | Check time, n=1000 | n=2000 |
| -------------------- | --------------------------------------------------- | ---------------------: | --------: | ------------: | -----------------: | -----: |
| (n=0, all variants)  | the package, the prototypes                         |                 91,364 |           |               |              0.19s |        |
| `inferred`           | today: services inferred, inline middleware         |                239,553 |   379,431 |           140 |              0.33s |  0.48s |
| `provide-layer`      | P1: one base procedure provides all 20 services     |                247,470 |   395,352 |           148 |              0.36s |  0.49s |
| `middleware-service` | P2: auth is `useService(t.procedure, Auth)`         |                238,739 |   378,617 |           140 |              0.32s |  0.47s |
| `output`             | `.output(Schema)` on each                           |                679,123 | 1,255,198 |           576 |              0.89s |  1.67s |
| `declared`           | `output` + `.errors({ NOT_FOUND: { data } })`       |              1,006,500 | 1,912,493 |           906 |              1.38s |  2.66s |
| `strict`             | P3: `declared` + `strict()`                         |              1,312,147 | 2,523,227 |         1,211 |              1.53s |  3.12s |
| `contract`           | P4: a contract with the same schemas, `t.implement` |              1,526,865 | 2,952,895 |         1,426 |              1.56s |  2.98s |

- **Layering is free.** `provideLayer` costs 8 more instantiations per procedure than inferred services (+3%), and `useService` costs nothing. Both remove services from the router's `R`, which the handler's `layer` check then reads.
- **Declaring is the cost, not checking.** Effect Schema outputs add about 436 instantiations per procedure, and `.errors()` with a `data` schema about 330 more. That is the price of any declared mode, Effect RPC's included: its `Rpc.make` carries the same schemas.
- **`strict()` adds about 30% on top of declaring** (305 instantiations, about 0.15 ms per procedure), which pays for the errors-subset check. A first version whose parameter was `ProcedureBuilder<TDef> & DeclaresOutput<TDef>` cost twice as much (2.05M at n=1000): checking the argument compared the whole builder interface. A check on a builder flag would avoid that too.
- **Contracts cost about 50% more than declaring in the builder** (520 instantiations per procedure). The schemas sit in the contract, and the implementer's types (`ImplementerDef`, `ExactRouter`, `ImplementedRouter`) are added on top. Check time ends up about the same as `strict`.
- The sibling measurement for exhaustive declarations (every declared error reachable, `DeclaredCheck`): +22% instantiations and +10% memory at 1,500 procedures, about +0.1 ms per procedure.
- Everything is linear from 1,000 to 2,000 procedures.

## Bundle cost

Minified with rolldown, `effect` and `@trpc12/trpc` external, gzip -9: `layer.ts` 379 B, `middleware-service.ts` 163 B, `strict.ts` 63 B (an identity function). All are server-only. The client bundle doesn't change in any option, since contracts and strict checks are types.

## Implications

- P1 (`.provide(layer)`) is the Effect-native answer to "layer in deps": build once in the handler's runtime, the way `toLayer`, `HttpApiBuilder.group` and `HttpRouter.provideRequest` do. It costs nothing to type-check and about 0.4 KB on the server. In the core it would build in `ManagedRuntime.memoMap` and `.scope`, so `dispose()` releases it.
- Per-call layers are already possible: an Effect middleware can return `next().pipe(Effect.provide(TxLive))`. A `lifetime: 'call'` option would be sugar for it, and needs the call scope to span streamed outputs first.
- P2 (middleware as a service) is a pattern that works today as an Effect middleware whose body yields its implementation. A helper and a standard `MiddlewareImpl` type would give tRPC `RpcMiddleware`'s split between declaration and implementation, and would let contracts declare middleware.
- Strictness: contracts already match `effect/rpc`. A strict builder mode would cost about 30% over declaring everything, and is worth it only if people want contract-level checks without a separate contract.
