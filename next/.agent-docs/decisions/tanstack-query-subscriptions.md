# TanStack Query subscriptions: one observer, plus streamed and live queries (agent)

- `SubscriptionObserver` is the framework-agnostic core, like TanStack's `QueryObserver`. Statuses are `idle`, `connecting`, `active` and `error`. It starts with the first listener and stops with the last; a new key or `enabled` restarts it; callbacks use the latest options; `reset()` starts it again; each change is a new immutable result. Every adapter wraps it in a few lines, so semantics match everywhere.
- Adapters start subscriptions only in the browser lifecycle, never during SSR: an effect (React, Preact), `onMounted` or immediately in a bare effect scope (Vue), `onMount` (Solid), `$effect` (Svelte), `afterNextRender` (Angular), `hostConnected` (Lit).
- Q19.5: in v1. `streamedOptions` accumulates a subscription's events into an array, with TanStack's `refetchMode` and an optional `maxChunks`; `liveOptions` keeps the latest event. A query whose output is an `AsyncIterable` also streams through `queryOptions()`, and its data is the chunk array.
- Lost: subscription state only in the `QueryClient` cache (`liveOptions` alone). It's kept next to `useSubscription`, not instead of it, because `onData` callbacks and per-event side effects don't fit the cache.
- Lives in: `packages/tanstack-query/src/subscription.ts`, each adapter's `src/index.ts`.
