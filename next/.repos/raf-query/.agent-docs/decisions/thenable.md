# `Thenable` type (human asked)

- `Thenable<T>` (core, public type) = `Promise<T>` & a `status` union (`pending` / `fulfilled` + `value` / `rejected` + `reason`), the fields React's `use()` reads. `Query.State.promise` is typed with it. The value `useQuery` returns is one of these at runtime.
- **`useQuery`'s public result is `Thenable<T>`** (human, 2026-10-16, reversing the 2026-10-14 `Promise<T>` call: "I don't think that was a good decision"): the tuple's first slot is `Thenable<Data>` (or `Thenable<Result<Data, ErrorOf>>`), so apps can read `status` / `value` / `reason` without `use()` — TanStack's non-suspending `data`.
- Library code that already ensured a query returns or reads its thenable instead of re-checking `data !== undefined` (`QueryCache.fetch` succeeds with a handle holding the cached data on a hit, the first fetch's on a miss). No `unwrap()` helper (human).
- Apps, examples and docs read with React's `use()` when they want Suspense (human); reading `status` is the non-suspending read.
