---
title: Should a TanStack query be able to opt out of being aborted when nothing observes it any more?
summary: Queries always pass TanStack's signal, so an unmounted query aborts its call on both ends; a per-query option could let it finish and cache.
area: tanstack
recommended: B
links:
  - kind: docs
    label: TanStack Query (cancellation)
    url: https://v12.trpc.io/v12/docs/integrations/tanstack-query#cancellation
  - kind: decision
    label: tanstack-query-signal
    url: ../decisions/tanstack-query-signal.md
  - kind: proposal
    label: 19 TanStack Query
    url: ../proposals/19-tanstack-query.md
  - kind: code
    label: queryOptions and infiniteOptions (utils.ts)
    url: ../../packages/tanstack-query/src/utils.ts
  - kind: issue
    label: 'v11 issue #4448'
    url: https://github.com/trpc/trpc/issues/4448
---

# Should a TanStack query be able to opt out of being aborted when nothing observes it any more?

## Why it matters

`queryOptions()` and `infiniteOptions()` always hand TanStack's `signal` to the call. TanStack treats a read signal as "cancellable", so a query that loses its last observer (unmount, input change) or meets `cancelQueries()` aborts the request, the server's `signal` aborts, and the late result isn't cached. That was v11's opt-in `abortOnUnmount: true`, now the only behaviour. A slow query the user leaves and comes back to starts over, and there is no switch: a `context` link option can't help, since TanStack decides by whether `signal` was read.

## Options

### A) Keep it: always pass the signal

No option. A query that must finish uses its own `queryFn`.

```ts
useQuery(trpc.report.build.queryOptions({ input: { id } })); // aborted when unobserved

// escape hatch: a queryFn that doesn't read the signal
useQuery({
  ...trpc.report.build.queryOptions({ input: { id } }),
  queryFn: () => client.report.build.query({ id }),
});
```

- ✅ One behaviour; interruption is how Effect and the server stop work
- ❌ The escape hatch loses what `queryOptions()`'s `queryFn` does (streamed outputs as `streamedQuery`)
- ❌ A slow query the user navigates away from and back to runs again from the start

### B) Keep the default, add `abortWhenUnobserved: false` per query

`queryOptions()` and `infiniteOptions()` take `abortWhenUnobserved` (default `true`); `false` skips reading `signal`, so TanStack lets the call finish and caches it.

```ts
useQuery(
  trpc.report.build.queryOptions({ input: { id }, abortWhenUnobserved: false }),
);
// the call finishes and its result is cached for the next mount
```

- ✅ The default stays Effect's (interrupt); the opt-out is v11's default, per query
- ✅ Named like the option `streamedMutationOptions()` already has
- ❌ One more option on `queryOptions()`, defaulting to `true` where the streamed-mutation one defaults to `false`

### C) v11's default: don't pass the signal unless asked

Queries finish unless they opt in, as v11's `trpc: { abortOnUnmount: true }` did.

```ts
useQuery(trpc.report.build.queryOptions({ input: { id } })); // finishes, cached
useQuery(trpc.search.queryOptions({ input: { q }, abortWhenUnobserved: true })); // aborted when unobserved
```

- ✅ No behaviour change for v11 users
- ❌ Unwatched queries keep running on both ends, which issue #4448 calls out, and the default goes against interruption

## Recommendation

**B.** Interruption stays the default, as Effect and TanStack's own guide recommend, and the opt-out is one boolean where a query needs it, without rewriting its `queryFn` ([`effect-native-by-default.md`](../decisions/effect-native-by-default.md)).

## Blocked until answered

- Nothing. B is a small change in `createTrpcQueryUtils` (read `ctx.signal` only when the option isn't `false`) and a line in the TanStack docs.

## Details

- The decision's Open bullet sketches `queryOptions({ input, signal: false })`; `abortWhenUnobserved` reuses the name streamed mutations already have. Either name works the same way.
- v11's `@trpc/tanstack-react-query` passed `signal: null` unless `trpc: { abortOnUnmount: true }`; `@trpc/react-query` also had a client-wide `abortOnUnmount`. A client-wide default could follow B if users ask.
