# Packages

- Route generation/code splitting live in `router-generator`/`router-plugin`; Start build transforms live in `start-plugin-core`.

## Router bindings

- Navigation/render identity is more than href or route membership: same-href navigations can have different history keys, and suspended renders must acknowledge only their own match publication. Preserve those identity checks when optimizing stores or render notifications.
- In navigation params/search, an explicit `undefined` can clear an inherited value; an absent key can inherit it. Preserve that distinction when comparing or memoizing options; React's `useValueStable` uses `deepEqual` with `ignoreUndefined: false`.

## Tests

- Inspect test commands: several `test:unit` scripts immediately exit or only echo a message. For these packages, validate behavior in the shared core or consuming e2e app; a successful placeholder target provides no unit coverage.
- For `*-router-ssr-query` changes, run `router-ssr-query-core` unit tests and the affected framework's `e2e/<framework>-start/query-integration` tests. The framework wrapper unit targets currently exit without running tests.
- For single-command Vitest targets, append filters after `--`, e.g. `-- tests/link.test.tsx -t "preloading"`.
- `solid-router` and `router-generator` chain two Vitest commands in `test:unit`. Trailing file/name/update arguments reach only the final command. Run the full target for verification: Solid needs browser and server suites; the generator needs fixture generation followed by typechecking.
- For public type changes, add `*.test-d.*` inference regressions and run both unit and type targets. React/Solid Router's TypeScript compiler matrix checks `src`; Vitest runs their inference tests. For changes to inference cost, follow the [type-safety performance guidance](../docs/router/guide/type-safety.md#performance-recommendations); `test:perf` measures runtime, not compiler cost.
