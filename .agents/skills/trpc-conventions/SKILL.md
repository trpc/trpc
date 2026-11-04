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
- Add tests; don't rewrite or weaken existing ones unless the expected behaviour changed and the PR says why.

## TypeScript

- Internal (non-exported) parameters, properties and options are required: pass an explicit `null`, a literal string or a symbol. Optionals are only for the convenience of public APIs.

  ```ts
  function connect(url: string, retry?: RetryOptions); // before
  function connect(url: string, retry: RetryOptions | null); // after
  ```

- Take one options object, `opts`, and read its members. Destructure only keys read three or more times.
- Clean up with `await using` and `makeResource()` or `makeAsyncResource()`, not `try`/`finally`.
- Brands use `__brand`, as in `stream/tracked.ts`. `any` is fine in generic constraints such as `AnyRouter`. Declare return types only on public APIs.
- Lint (`.oxlintrc.json`, `tooling/oxlint-plugin/`) already enforces type imports, at most three parameters, type-parameter names, no non-null assertions and exhaustive switches.
