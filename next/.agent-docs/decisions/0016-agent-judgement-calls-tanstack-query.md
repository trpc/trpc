# 0016 — Agent judgement calls for the TanStack Query integration

| Proposal                                | Date       | Status      | Supersedes | Superseded by                                                        |
| --------------------------------------- | ---------- | ----------- | ---------- | -------------------------------------------------------------------- |
| [19](../proposals/19-tanstack-query.md) | 2026-10-11 | provisional | —          | [0017](./0017-integration-packages-per-dependency.md) (Q19.1 layout) |

Alex asked to "build the tanstack query package, make some sort of core foundation in a lib and add support for every lib tanstack query has support for. Make decisions independently, we can always challenge and refactor later". Every call below is the agent's, not Alex's. Q19.2 was already decided ([0008](./0008-tanstack-option-bag.md)) and is followed.

## Decision

### Proposal 19 questions

- **Q19.1:** one framework-agnostic package, `@trpcdev/tanstack-query`, with a subpath per official TanStack adapter. The root entry point depends only on `@tanstack/query-core`. Each framework is an optional peer.

  | Subpath    | TanStack adapter                            | Context helpers                                                                 | Subscription primitive                        |
  | ---------- | ------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
  | `.`        | `@tanstack/query-core`                      | —                                                                               | `SubscriptionObserver`                        |
  | `/react`   | `@tanstack/react-query`                     | `createTRPCContext()` → `{ TRPCProvider, useTRPC, useTRPCClient }`              | `useSubscription(options)`                    |
  | `/preact`  | `@tanstack/preact-query`                    | same as React                                                                   | `useSubscription(options)`                    |
  | `/vue`     | `@tanstack/vue-query`                       | `{ TRPCPlugin, provideTRPC, useTRPC, useTRPCClient }`                           | `useSubscription(MaybeRefOrGetter)` → refs    |
  | `/solid`   | `@tanstack/solid-query`                     | `{ TRPCProvider, useTRPC, useTRPCClient }`                                      | `useSubscription(accessor)` → getters         |
  | `/svelte`  | `@tanstack/svelte-query` (v6, runes)        | `{ setTRPCContext, useTRPC, useTRPCClient }`                                    | `createSubscription(getter)` → getters        |
  | `/angular` | `@tanstack/angular-query-experimental`      | `{ provideTRPC, injectTRPC, injectTRPCClient }`                                 | `injectSubscription(fn)` → signals            |
  | `/lit`     | `@tanstack/lit-query` (with `@lit/context`) | `TRPCProvider` element class, `useTRPC(host)`, `useTRPCClient(host)`, `context` | `createSubscriptionController(host, options)` |

  Each adapter's `createTRPCContext<TRouter, TContext>()` takes a router type, a `routerType()` value's type or a contract, plus the context the client's links declare. The names follow each adapter's own conventions: `use*` for React, Preact, Vue and Solid, `create*` for Svelte, `inject*`/`provide*` for Angular, and controllers for Lit.

  Two departures from the proposal's sketch:
  - Providers take only `client`, and the app renders TanStack's own `QueryClientProvider` (or plugin) next to them. The sketch had v11's `trpcClient` and `queryClient` props. Keeping the query client out means each adapter's own provider and devtools stay the source of truth.
  - The hydration helper is `hydrationOptions()`, not `hydrationSerializer` (see Hydration below).

- **Q19.3:** explicit `input: (pageParam) => TInput`, as recommended. The page param's type comes from the annotation (the spike's pitfall), so the docs and tests always annotate it.
- **Q19.4:** `createTRPCQueryUtils({ client })`, the proposal's working name. v11's `createTRPCOptionsProxy` describes the implementation, not what it gives you.
- **Q19.5:** yes, in v1. They take subscription procedures:
  - `streamedOptions` accumulates events into an array, with TanStack's `refetchMode` and an optional `maxChunks`;
  - `liveOptions` keeps the latest event.

  A query whose output is an `AsyncIterable` (an async-generator query) also streams through `queryOptions()`. Its data type is the chunk array.

- **Q19.6:** Pinia Colada later.

### Types

- **Typed from the client, not the router.** `TRPCQueryUtils<TClient>` maps the client's shape: a `query` method makes query helpers, `mutate` makes mutation helpers, `subscribe` makes subscription helpers. The same factory therefore accepts `createTRPCClient(...)` in the browser and `createRouterClient(router, { ctx })` for server prefetching. Inputs, outputs, typed errors (07) and link-declared `context` (17) all come from the client's call signatures.
- **Errors:** the `error` type is the procedure's error union, the same one the client sees. `DataTag` keys carry it into `getQueryData`/`setQueryData`.
- **Returned options fit every adapter.** The returned objects omit `enabled` and `initialData` from TanStack's input type:
  - `enabled` comes back as `boolean`, because Vue and Svelte don't accept the `(query) => boolean` form;
  - `initialData` only comes back from the defined-`initialData` overload, because Solid's overloads split on it.

  Input bags stay non-generic, so a misspelled option is still an excess-property error.

- **`skipToken`:** `input: skipToken` gives `queryFn: skipToken`. The returned `queryFn` stays typed as a `QueryFunction`, so `useSuspenseQuery` still accepts the options. The key drops the input.
- **Reserved names:** `pathKey`, `pathFilter` and the helper names (`queryOptions`, `queryKey`, …) can't be procedure names. An unknown helper call throws a `TypeError`.

### Keys

- Query keys are v11's `[path[], { input?, type }]`, with `type` one of `'query' | 'infinite' | 'streamed' | 'live'`. Each helper has a matching key function (`queryKey`, `infiniteKey`, `streamedKey`, `liveKey`).
- Mutation keys are `[path]`.
- `pathKey()` is `[path]`, and `pathFilter()` adds TanStack filter options to it. The root `trpc.pathKey()` is `[[]]`, which matches every tRPC query and nothing else.

### Subscriptions

- `SubscriptionObserver` in the root entry point is the framework-agnostic core, like TanStack's `QueryObserver`:
  - statuses are `idle`, `connecting`, `active` and `error`;
  - it starts with the first listener and stops with the last;
  - a new key or `enabled` value restarts it, and callbacks always use the latest options;
  - `reset()` starts it again;
  - each state change produces a new, immutable result.

  Every adapter wraps it in a few lines, so the semantics are identical everywhere.

- Adapters start subscriptions only in the browser lifecycle, never during SSR:
  - React: an effect;
  - Preact: an effect;
  - Vue: `onMounted`, or immediately in a bare effect scope;
  - Solid: `onMount`;
  - Svelte: `$effect`;
  - Angular: `afterNextRender`;
  - Lit: `hostConnected`.

### Hydration

- `hydrationOptions({ serializer? })` returns `{ dehydrate, hydrate }` defaults for a `QueryClient`. They use danSON (11) by default, so `Date`, `Map`, `BigInt` and similar types survive a server render. Pending queries are dehydrated too, so a server can stream them.

### Tests

- `test/tanstack-query/` has one file per adapter, plus `core.test.ts`.
  - Every test uses a real `createTestServer`, a real `httpLink` client and real components.
  - They render in happy-dom, with the same-origin policy disabled for the cross-origin test server.
  - React also covers `renderToString` with `HydrationBoundary` and `hydrateRoot`.
  - Solid and Svelte run as separate Vitest projects with browser resolve conditions and inlined dependencies. Under Node conditions they resolve to their server builds.
  - Svelte components are `.svelte` files compiled by `@sveltejs/vite-plugin-svelte`.
  - Angular uses JIT with zoneless `TestBed`.
- `test/portability/tanstack-query.ts` emits declarations for the helpers and every adapter's context.

## Rationale

The proposal's recommendations, built out. One package keeps the type mapping and key format in one place; adapters only add what can't be framework-agnostic (context and a subscription primitive). Typing from the client rather than the router means server prefetching, contracts and link context need no extra generics.

## Rejected alternatives

- **Per-framework packages (Q19.1).** The core would be duplicated, or else it would need a seventh package anyway.
- **v11's `cursor` convention (Q19.3).** It ties the procedure's input shape to TanStack.
- **Router-typed utils (`createTRPCQueryUtils<AppRouter>({ client })`).** Redundant with the client's types, and it can't see link context.
- **Subscription state in the `QueryClient` cache (only `liveOptions`).** Kept as an option next to `useSubscription`, not instead of it. `onData` callbacks and per-event side effects don't fit the cache.
- **`svelte-check` for `.svelte` files.** It doesn't run on TypeScript 7 yet. Type assertions for Svelte live in `svelte.test.ts`.

## Parity impact

[`../reference/orpc-parity.md`](../reference/orpc-parity.md):

- TanStack Query for React, Vue, Solid, Svelte and Angular is built, plus Preact and Lit.
- Streamed and live queries are built.
- Pinia Colada is not built.

## Follow-ups

- [ ] Alex confirms or overrides Q19.1 and Q19.3–Q19.6.
- [ ] Pinia Colada (`@trpcdev/pinia-colada` or a `/pinia-colada` subpath).
- [ ] `useQueries`/`createQueries` with tRPC options: expected to work (they take the same objects) but untested.
- [ ] SSR tests for adapters other than React (Solid, Svelte, Vue and Angular server renderers).
- [ ] Type-check `.svelte` components once `svelte-check` supports TypeScript 7.
- [ ] Mutation-key filters (`mutationFilter`) if `useMutationState` needs them.
