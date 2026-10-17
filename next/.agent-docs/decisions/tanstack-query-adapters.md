# TanStack Query: one core, a thin adapter per framework (agent)

- `@trpc12/tanstack-query` holds the framework-agnostic core on `@tanstack/query-core`. Each adapter package ([`integration-packages.md`](./integration-packages.md)) adds only what can't be agnostic, context and a subscription primitive, so the type mapping and key format live in one place:

  | Package                          | Context helpers                                                                 | Subscription primitive                        |
  | -------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
  | `@trpc12/tanstack-query`         | —                                                                               | `SubscriptionObserver`                        |
  | `@trpc12/tanstack-react-query`   | `createTrpcContext()` → `[TrpcProvider, useTrpc, useTrpcClient, context]`       | `useSubscription(options)`                    |
  | `@trpc12/tanstack-preact-query`  | same as React                                                                   | `useSubscription(options)`                    |
  | `@trpc12/tanstack-vue-query`     | `{ TrpcPlugin, provideTrpc, useTrpc, useTrpcClient }`                           | `useSubscription(MaybeRefOrGetter)` → refs    |
  | `@trpc12/tanstack-solid-query`   | `[TrpcProvider, useTrpc, useTrpcClient]`                                        | `useSubscription(accessor)` → getters         |
  | `@trpc12/tanstack-svelte-query`  | `[useTrpc, setTrpcContext, useTrpcClient]` (Svelte 5 runes)                     | `createSubscription(getter)` → getters        |
  | `@trpc12/tanstack-angular-query` | `{ provideTrpc, injectTrpc, injectTrpcClient }`                                 | `injectSubscription(fn)` → signals            |
  | `@trpc12/tanstack-lit-query`     | `TrpcProvider` element class, `useTrpc(host)`, `useTrpcClient(host)`, `context` | `createSubscriptionController(host, options)` |

- `createTrpcContext<T>()` takes one type argument ([`tanstack-context-shape.md`](./tanstack-context-shape.md)): a client factory's type, a client's type, or a router type (a `routerType()` value's type or a contract). Names follow each adapter: `use*` (React, Preact, Vue, Solid), `create*` (Svelte), `inject*`/`provide*` (Angular), controllers (Lit).
- (agent) From a client factory or client type it reads the router, link context and link types ([`replaceable-serializers.md`](./replaceable-serializers.md)).
- Providers take only `client`; the app renders TanStack's own `QueryClientProvider` (or plugin) next to them, so TanStack's provider and devtools stay the source of truth. Lost: v11's `trpcClient` and `queryClient` props.
- Human, 2026-10-16 (Q19.4, decision round): "A". `createTrpcQueryUtils({ client })`. v11's `createTRPCOptionsProxy` describes the implementation, not what it gives you.
- Tests (`src/index.test.ts` in each adapter package, plus `packages/tanstack-query/src/index.test.ts`) use a real `createTestServer`, `httpLink` and components in happy-dom with the same-origin policy off. React also covers `renderToString` with `HydrationBoundary` and `hydrateRoot`. Solid and Svelte are separate Vitest projects with browser conditions and inlined dependencies (Node conditions resolve their server builds). Svelte components are `.svelte` files; Angular is JIT with zoneless `TestBed`.
- Lost: `svelte-check` for `.svelte` files, which doesn't run on TypeScript 7 yet; Svelte type assertions live in `svelte.test.ts`.
- (agent) SSR is tested in every adapter that has a server renderer: React and Vue render, then hydrate without refetching; Solid (`solid-ssr.test.ts`, the server build under Node's conditions, components through `ssr` templates), Svelte (`svelte-ssr`, its own Vitest project that compiles `.svelte` for the server) and Angular (`angular-ssr.test.ts`, `renderApplication` with `provideServerRendering`) render prefetched rich data. All check that no subscription opens on the server.
- (agent) `useQueries` takes `queryOptions()` as they are (tested with React's `combine` and `QueriesObserver`). `mutationFilter({ ...filters })` gives `useMutationState`, `useIsMutating` and `isMutating()` the procedure's mutation key, with `predicate` typed by the procedure; it returns TanStack's plain `MutationFilters`, which is what those APIs accept.
- Open: `svelte-check` once it supports TypeScript 7.
- (agent) Checked 2026-10-16: `svelte-check` 4.7.6 still peers `typescript` `^5 || ^6`, so the Open waits on upstream.
- Lives in: `packages/tanstack-*/src/`, `packages/tanstack-query/src/utils.ts` (`mutationFilter`), `packages/tanstack-*-query/src/ssr.test.ts`, `packages/tanstack-svelte-query/src/fixtures/Ssr.svelte`, `vite.config.ts` (`svelte-ssr` project), `docs/tanstack-query.md`.
