# Links are Effect functions on a `Stream` core (human)

- A link is a callable `TrpcLink<TDecl, TRouter>`: `({ op, next }) => Stream`. `link(fn)` builds one from an Effect function; v11 links convert with `fromV11Link`. The client takes them as an array ([`client.md`](./client.md), Q16.6).
- `TDecl` declares the call options a link reads; they sit top-level on the call (Q17.5 F-A, from the human Q16.2 in [`client.md`](./client.md)); declarations typed `any` are ignored when merging. It is an invariant phantom, so a link that declares nothing doesn't absorb the others' declarations in an array.
- Why callable: TypeScript only infers an inline generic link's type parameters from return-type context when the type is callable. That is what lets `splitLink({ condition: (op) => … })` see `op.path` as the router's paths.
- Human, 2026-10-16 (Q17.1, decision round): "B, build an interop mode to transform v11 links". Links are written with Effect only (L-A).
  - (agent) Built, 2026-10-16: `link(fn)` takes `({ op, next }) => Stream` only; `link(async …)`, `link.effect` and `PromiseLinkOpts` are gone. `fromV11Link(v11Link)` in `@trpc12/trpc/interop` (`src/interop/link.ts`) runs a v11 `TRPCLink`, including terminating ones such as v11's `httpBatchLink`. The v11 link gets v11-shaped operations and observables (`pipe`, so `tap`/`map`/`share` from `@trpc/server/observable` work). The codemod notes `TRPCLink` imports and points at `fromV11Link`.
  - (agent, tentative) Inside a v11 link, errors from `next` are v12 `TrpcError`s, not `TRPCClientError`s. Errors the v11 link fails with become `TrpcError`s with the code from `data.code`. Subscriptions emit `started` and then `data`, never `stopped`. Tests: `packages/trpc/src/interop/link.test.ts`, `interop-v11.test.ts`.
- Human, 2026-10-16 (Q17.2, decision round): "A". Every operation is a `Stream` on an Effect core (OR-A).
- Human, 2026-10-16 (Q17.3, decision round): "B". `createTrpcClient({ router: routerType<AppRouter>(), links })` is the only form; it infers what links declare. The `createTrpcClient<AppRouter>({ links })` form and augmenting `TrpcClientContext` go; the codemod rewrites v11's `createTRPCClient<AppRouter>(…)`.
  - (agent) Built, 2026-10-16: the explicit-generic overloads of `createTrpcClient` and `createEffectClient` are gone. The built-in fields (`headers`, `init`, `batch`, `reconnect`) became the closed type `BuiltinCallOptions`. The codemod moves the type argument into `router: routerType<…>()`.
- Built-in links:
  - `httpLink`: `batch`, streaming and SSE by negotiation; `longQuery: 'post' | 'query'` ([`wire-protocol.md`](./wire-protocol.md)).
  - `splitLink`, typed with the router's paths; `loggerLink`, `retryLink`, `localLink`.
  - `wsLink`: connects lazily; reconnects with an exponential delay, 5 attempts by default; resends subscriptions with their `lastEventId`; fails in-flight queries and mutations with `NETWORK_ERROR`; optional `idleMs` close; `close()` and `Symbol.asyncDispose`.
  - `messagePortLink`: the same core, no reconnect.
  - (agent) `subscribe(input, { reconnect: false })` opts one subscription out of reconnecting, on `httpLink` and `wsLink`, for subscriptions with side effects that must not rerun. It's a `BuiltinCallOptions` field, next to `headers`.
  - `dedupeLink`: shares in-flight queries, and aborts the shared request only when every caller has aborted. Mutations and subscriptions are never shared; `{ dedupe: false }` opts out. What counts as the same query, and how streams are shared: [`dedupe-link.md`](./dedupe-link.md).
- Lives in: `packages/trpc/src/client/link.ts`, `src/client/links/`.
