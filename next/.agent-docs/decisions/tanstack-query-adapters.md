# TanStack Query: one core, a thin adapter per framework (agent)

- `@trpcdev/tanstack-query` holds the framework-agnostic core on `@tanstack/query-core`. Each adapter package ([`integration-packages.md`](./integration-packages.md)) adds only what can't be agnostic, context and a subscription primitive, so the type mapping and key format live in one place:

  | Package                           | Context helpers                                                                 | Subscription primitive                        |
  | --------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
  | `@trpcdev/tanstack-query`         | —                                                                               | `SubscriptionObserver`                        |
  | `@trpcdev/tanstack-react-query`   | `createTRPCContext()` → `{ TRPCProvider, useTRPC, useTRPCClient }`              | `useSubscription(options)`                    |
  | `@trpcdev/tanstack-preact-query`  | same as React                                                                   | `useSubscription(options)`                    |
  | `@trpcdev/tanstack-vue-query`     | `{ TRPCPlugin, provideTRPC, useTRPC, useTRPCClient }`                           | `useSubscription(MaybeRefOrGetter)` → refs    |
  | `@trpcdev/tanstack-solid-query`   | `{ TRPCProvider, useTRPC, useTRPCClient }`                                      | `useSubscription(accessor)` → getters         |
  | `@trpcdev/tanstack-svelte-query`  | `{ setTRPCContext, useTRPC, useTRPCClient }` (Svelte 5 runes)                   | `createSubscription(getter)` → getters        |
  | `@trpcdev/tanstack-angular-query` | `{ provideTRPC, injectTRPC, injectTRPCClient }`                                 | `injectSubscription(fn)` → signals            |
  | `@trpcdev/tanstack-lit-query`     | `TRPCProvider` element class, `useTRPC(host)`, `useTRPCClient(host)`, `context` | `createSubscriptionController(host, options)` |

- `createTRPCContext<TRouter, TContext>()` takes a router type, a `routerType()` value's type or a contract, plus the context the client's links declare. Names follow each adapter: `use*` (React, Preact, Vue, Solid), `create*` (Svelte), `inject*`/`provide*` (Angular), controllers (Lit).
- Providers take only `client`; the app renders TanStack's own `QueryClientProvider` (or plugin) next to them, so TanStack's provider and devtools stay the source of truth. Lost: v11's `trpcClient` and `queryClient` props.
- Q19.4: `createTRPCQueryUtils({ client })`, the proposal's working name. v11's `createTRPCOptionsProxy` describes the implementation, not what it gives you.
- Tests (`test/tanstack-query/`, one file per adapter plus `core.test.ts`) use a real `createTestServer`, `httpLink` and components in happy-dom with the same-origin policy off. React also covers `renderToString` with `HydrationBoundary` and `hydrateRoot`. Solid and Svelte are separate Vitest projects with browser conditions and inlined dependencies (Node conditions resolve their server builds). Svelte components are `.svelte` files; Angular is JIT with zoneless `TestBed`.
- Lost: `svelte-check` for `.svelte` files, which doesn't run on TypeScript 7 yet; Svelte type assertions live in `svelte.test.ts`.
- Open: `useQueries`/`createQueries` with tRPC options (expected to work, untested); SSR tests for Solid, Svelte, Vue and Angular; `svelte-check` once it supports TypeScript 7; `mutationFilter` if `useMutationState` needs it.
- Lives in: `packages/tanstack-*/src/`, `test/tanstack-query/`.
