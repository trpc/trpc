---
name: trpc-conventions
description: tRPC's test setup and TypeScript conventions, which win where the generic pstack tdd, typescript-best-practices and principle-type-system-discipline skills disagree. Use when fixing a bug, writing or changing tests, or writing or reviewing TypeScript in packages/.
---

# tRPC conventions

## Tests

- Every bug fix gets a regression test that fails without the fix, even when the test path is an integration test. Put it in `packages/tests/server/regression/issue-<number>-<slug>.test.ts`, or beside the code's existing tests (the legacy React package has `packages/react-query/test/regression/`).
- Test through a real client and server. `testServerAndClientResource` is in `@trpc/client/__tests__/testClientResource`; the React packages have their own helpers, so copy the setup from the nearest test.

  ```ts
  await using ctx = testServerAndClientResource(router);
  ```

- Watch it fail, then pass: `pnpm vitest run <file>` from the repo root.
- The PR's `Regression check:` line names the test and what it catches without the fix.
- In new tests, wait on a condition with `vi.waitFor` rather than a fixed sleep.
- No `beforeEach`, `beforeAll`, `afterEach` or `afterAll` (`vitest/no-hooks`). Each test sets up what it needs with `using`/`await using`: a helper returns a disposable that undoes its setup, such as `using _timers = fakeTimersResource()`. Share expensive read-only setup with a memoised getter instead of `beforeAll`.
- Add tests; don't rewrite or weaken existing ones unless the expected behaviour changed and the PR says why.

## TypeScript

- Every export in `packages/*/src` has a release tag in its JSDoc (`trpc/release-tag`): `@public` if it's for users, `@internal` if it's for tRPC itself, even when another tRPC package imports it or an entry point exports it. The tag is a hint to users, so it states intent; nothing derives it. `@public` code doesn't live in an `internal(s)` folder or file: move it out, or tag it `@internal`.
- Internal parameters, properties and options are required. Pass absence explicitly as `null`, `undefined`, a literal or a symbol, whichever fits: `x: T | undefined` that every caller passes is fine, but not `x?: T` or an optional or defaulted parameter. Optionals are only conveniences on public APIs; normalise a public options object once at the boundary into a fully required internal shape. `trpc/no-internal-optional` enforces this on `@internal` declarations, and on non-exported ones that no public declaration's type uses. A shape users write or read without a public type naming it, such as an option type only an internal type refers to, takes `@public` even when it isn't exported.

  ```ts
  function connect(url: string, retry?: RetryOptions); // before
  function connect(url: string, retry: RetryOptions | null); // after
  ```

- Take one options object, `opts`, and read its members. Destructure only keys read three or more times.
- Clean up with `await using` and `makeResource()` or `makeAsyncResource()`, not `try`/`finally`.
- Brands use `__brand`, as in `stream/tracked.ts`. `any` is fine in generic constraints such as `AnyRouter`. Declare return types only on public APIs.
- Lint (`.oxlintrc.json`, `tooling/oxlint-plugin/`) already enforces type imports, at most three parameters, type-parameter names, no non-null assertions and exhaustive switches.
