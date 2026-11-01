---
title: Should `createTrpcContext` take its client or router as a value, like every other client-facing entry point?
summary: 'Every entry point but `createTrpcContext<typeof makeClient>()` takes the router as a value; B makes it `createTrpcContext({ client: makeClient })`.'
area: tanstack
recommended: B
links:
  - kind: pr
    label: 'v11 #7767'
    url: https://github.com/trpc/trpc/pull/7767
  - kind: decision
    label: router-type-from-values
    url: ../decisions/router-type-from-values.md
  - kind: decision
    label: tanstack-context-shape
    url: ../decisions/tanstack-context-shape.md
  - kind: code
    label: createTrpcContext (React)
    url: ../../packages/tanstack-react-query/src/index.ts
---

# Should `createTrpcContext` take its client or router as a value, like every other client-facing entry point?

## Why it matters

[`router-type-from-values.md`](../decisions/router-type-from-values.md) asks that every client-facing entry point take the router the same way, as a value. All of them do except the seven adapters' `createTrpcContext<T>()`, which takes the type of the client factory (or of a client, or a router type) as its only type argument. That form was a human call ([`tanstack-context-shape.md`](../decisions/tanstack-context-shape.md)), so changing it needs one. It has no overloads and nothing else to infer, so it doesn't run into the partial-inference problem that forced v11's overloads; this is only about consistency.

## Options

### A) Keep the type argument

```ts
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url })],
  });
export const [TrpcProvider, useTrpc] = createTrpcContext<typeof makeClient>({
  keyPrefix: 'billing',
});
```

- ✅ Already built, documented and produced by the codemod; no change
- ✅ No runtime value for something only types need
- ❌ The one client-facing entry point that takes a type argument instead of a value

### B) Take the factory, a client or `routerType()` in the options bag

```ts
const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url })],
  });
export const [TrpcProvider, useTrpc] = createTrpcContext({
  client: makeClient,
  keyPrefix: 'billing',
});

// without a factory
export const [TrpcProvider, useTrpc] = createTrpcContext({
  router: routerType<AppRouter>(),
});
```

- ✅ Every entry point takes its types the same way, in one bag, with no type arguments
- ✅ `SourceRouter`, `SourceContext` and `SourceLinks` already read a factory or a client, so the types don't change
- ❌ `client: makeClient` is read only for its type: the provider still gets its own client
- ❌ Changes all seven adapters, their docs and the codemod (`createTRPCContext<AppRouter>()` becomes `createTrpcContext({ router: routerType<AppRouter>() })`)

### C) Accept both

```ts
export const [TrpcProvider, useTrpc] = createTrpcContext<typeof makeClient>();
export const [BillingProvider, useBilling] = createTrpcContext({
  client: makeBillingClient,
});
```

- ✅ Nothing written today breaks
- ❌ Two ways to type the same thing, which this decision is about removing

## Recommendation

**B.** It's what "all our client-facing things should work the same way" asks for, and it costs nothing at runtime: the factory is a value the app already has. Breaking changes are fine before v12's first release, and the codemod already rewrites this call.

## Blocked until answered

Nothing. The current form works and has no overloads.

## Details

With B, the provider's `client` prop could become optional, defaulting to one `makeClient()` per mounted provider, which is the `useState(() => makeClient())` boilerplate most apps write. That's a separate change, left out of B.
