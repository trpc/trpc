# No `use()`-native React package in v1; when one comes it is an Effect Atom store (human)

- Human, 2026-10-15 (decisions round 3, Q15 = proposal 20 Q20.1): "A but will be keen to see spikes of c and D".
- v1 ships the TanStack Query integration only.
- Spikes wanted, not shipped:
  - **C**, a `cacheLink()` that returns the same promise for the same key while cached, so `use(client.post.byId.query({ id }))` works, with `ignoreCache` as a call option.
  - **D**, an `AtomTrpc` modeled on Effect's `AtomRpc` (`effect/reactivity`): query and mutation atoms with reactivity keys, time-to-live and hydration, read with `useAtomSuspense` from `@effect/atom-react`.
- (agent) Guardrail: links can carry call options, so `ignoreCache` is typed without core changes. In-flight calls do not keep a stable promise identity: `request()` makes a new promise per call, so C needs a core hook (see the spike note).
- (agent) Passing server-started promises from React Server Components to `use()` on the client is not a v1 goal (Q20.3).
- Why: TanStack covers v1; a second cache is a maintenance cost until a spike shows it pays off.
- (agent) Spikes built ([note](../notes/react-use-spikes.md)). C needs a core hook for promise identity, plus a React store for invalidation. D works on `effect/reactivity` as is, except for hydration (no result `Schema`).
- (agent) Lean on Q20.2, the Effect-native way, if a package comes: an Effect Atom store (the `spikes/atom-trpc/` shape over `createEffectClient`), not a link cache. Atoms give React `use()`-friendly reads, Effect's interruption and typed errors; hydration needs an Effect `Schema` that encodes with the router's serializer. Nothing is built past the spikes, per the v1 decision above.
- Human, 2026-10-16 (Q20.2, decision round): "A, but I still wanna spike B that gives stable promises/thenables and does stuff like tanstack-query/raf-query of ensuring the value doesn't change if the internals doesn't change and keys should be sorted etc (see tanstack query source code for references)". The package, when it comes, is the Effect Atom store (spike D). Spike C grows stable thenables, structural sharing and sorted keys.
- (agent) The first time round this was skipped ("Skip, I'll need a desktop to review these"), then answered in the same round.
- (agent) Spiked, 2026-10-16 ([note, C round 2](../notes/react-use-spikes.md)): C's cache now sorts input keys before hashing, hands out thenables React reads without suspending once settled, and refetches stale entries in the background through a `replaceEqualDeep` port that also shares equal `Date`s. An equal refetch keeps the same thenable and tells nobody. Still needs the core hook and a React store.
- Lives in: `next/.agent-docs/notes/react-use-spikes.md`, `next/spikes/cache-link/`, `next/spikes/atom-trpc/`.
