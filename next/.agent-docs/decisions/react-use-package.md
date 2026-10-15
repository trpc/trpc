# No `use()`-native React package in v1; spike a link cache and Effect Atom (human)

- Alex, 2026-10-15 (decisions round 3, Q15 = proposal 20 Q20.1): "A but will be keen to see spikes of c and D".
- v1 ships the TanStack Query integration only.
- Spikes wanted, not shipped:
  - **C**, a `cacheLink()` that returns the same promise for the same key while cached, so `use(client.post.byId.query({ id }))` works, with `ignoreCache` as a call option.
  - **D**, an `AtomTrpc` modeled on Effect's `AtomRpc` (`effect/reactivity`): query and mutation atoms with reactivity keys, time-to-live and hydration, read with `useAtomSuspense` from `@effect/atom-react`.
- (agent) Guardrail: in-flight calls keep a stable promise identity and links can carry call options, so either spike can land without core changes.
- (agent) Passing server-started promises from React Server Components to `use()` on the client is not a v1 goal (Q20.3).
- Why: TanStack covers v1; a second cache is a maintenance cost until a spike shows it pays off.
- Open: Q20.2 (link or React store) is settled by the spikes.
- Lives in: spikes under `next/.agent-docs/notes/` plus throwaway code (not built yet).
