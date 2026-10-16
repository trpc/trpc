# `Thenable` type (human asked)

- `Thenable<T>` (core, public type) = `Promise<T>` & a `status` union (`pending` / `fulfilled` + `value` / `rejected` + `reason`), the fields React's `use()` reads. `Query.State.promise` is typed with it. The value `useQuery` returns is one of these at runtime.
- **`useQuery`'s public result is `Promise<T>`** (human, 2026-10-14): the tuple's first slot is `Promise<Data>` (or `Promise<Result<Data, ErrorOf>>`), so hovers and `^?` show `Promise`, not `Thenable`. Apps read it with `use()` and don't need `status` / `value` / `reason` on that type.
- Library code that already ensured a query returns or reads its thenable instead of re-checking `data !== undefined` (`QueryCache.fetch` succeeds with a handle holding the cached data on a hit, the first fetch's on a miss). No `unwrap()` helper (human).
- Apps, examples and docs read with React's `use()` (human).
