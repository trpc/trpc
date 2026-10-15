# Links are callable functions on an Effect `Stream` core (agent)

- A link is a callable `TrpcLink<TDecl, TRouter>`: `({ op, next }) => Stream`. `link(async fn)` and `link.effect(fn)` build one. The client takes them as an array ([`client.md`](./client.md), Q16.6).
- `TDecl` declares the call options a link reads (F-B); declarations typed `any` are ignored when merging. It is an invariant phantom, so a link that declares nothing doesn't absorb the others' declarations in an array.
- Why callable: TypeScript only infers an inline generic link's type parameters from return-type context when the type is callable. That is what lets `splitLink({ condition: (op) => … })` see `op.path` as the router's paths.
- L-B / OR-A: every operation is a `Stream` on an Effect core.
- Built-in links:
  - `httpLink`: `batch`, streaming and SSE by negotiation; `longQuery: 'post' | 'query'` ([`wire-protocol.md`](./wire-protocol.md)).
  - `splitLink`, typed with the router's paths; `loggerLink`, `retryLink`, `localLink`.
  - `wsLink`: connects lazily; reconnects with an exponential delay, 5 attempts by default; resends subscriptions with their `lastEventId`; fails in-flight queries and mutations with `NETWORK_ERROR`; optional `idleMs` close; `close()` and `Symbol.asyncDispose`.
  - `messagePortLink`: the same core, no reconnect.
  - (agent) `subscribe(input, { reconnect: false })` opts one subscription out of reconnecting, on `httpLink` and `wsLink`, for subscriptions with side effects that must not rerun. It's a built-in `TrpcClientContext` field, next to `headers`.
  - `dedupeLink`: shares in-flight queries with the same path and serialized input, and aborts the shared request only when every caller has aborted. Mutations and subscriptions are never shared; `{ dedupe: false }` opts out. Results are shared by reference, so a deferred `AsyncIterable` can be read only once among the sharers.
- Lives in: `packages/trpcdev/src/client/link.ts`, `src/client/links/`.
