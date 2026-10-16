# Router bundler plugin

- Preserve one initialization of shared module state across reference and split chunks. Shared extraction includes transitive dependencies and whole destructured declarations; never extract `Route` or bindings that depend on it. The invariant suite in `tests/code-splitter.test.ts` covers these contracts.
- `handleRouteUpdate` is stringified and injected into app modules. Keep runtime dependencies inside the function or explicitly emit them; extracting a helper to plugin module scope breaks the generated function. `tests/handle-route-update.test.ts` executes that emitted code.
- Route HMR rebuilds indexes, clears `resolvePathCache`, replaces lazy-chunk ownership, and refreshes active routes while preserving Fast Refresh component identities. Keep these steps coordinated when adding derived state.
- For code-splitting changes, add inputs under `tests/code-splitter/test-files/<framework>/`. Regenerate and review reference, virtual, and shared snapshots for every grouping in [`tests/code-splitter.test.ts`](tests/code-splitter.test.ts).
- Check [`tests/constants.ts`](tests/constants.ts) for framework coverage: the snapshot matrix currently covers React and Solid only. Validate affected Vue behavior in Vue router e2e apps.
