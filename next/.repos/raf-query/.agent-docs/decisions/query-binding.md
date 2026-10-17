# One framework-free `useQuery` in core: `QueryBinding` (agent)

- `@raf-query/core`'s `QueryBinding` is what the Vue and Svelte `useQuery`s used to copy line for line. It covers:
  - the observer, following a handle and options read through getters;
  - server reads derived from the cache;
  - announcing when a read pending promise settles in place;
  - the handle-`data` fallback, and `Result` wrapping for typed errors;
  - a result object of getters.
- A framework supplies `Hooks`:
  - `track`: read a version signal on every result read;
  - `notify`: bump that version on changes;
  - `untracked`: run cache writes outside its tracking (Svelte's `untrack`, because starting a read can notify synchronously).
  - The framework also subscribes on mount in the browser, and calls `syncUnsafe` from an effect.
- Pull, not push: every read calls `sync`, so markup that reads before the framework's effects still sees a new handle. A new handle switches queries only when its key hash changes, because `getQuery` calls the factory. An equal handle just replaces the stored one, so its `data` is used.
- Synchronous (`*Unsafe`), because renders are. The `QueryClient` stays a Promise facade over the Effect `QueryCache`, and isn't what bindings build on.
- React keeps its own `useQuery`. Its flow is `getOptimisticResultUnsafe` during render, `setOptionsUnsafe` in an effect, `useSyncExternalStore` and `use()`, and applying a handle during render would be a side effect in concurrent rendering. It shares `QueryBinding.queryFor`.
