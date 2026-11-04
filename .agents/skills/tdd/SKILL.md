---
name: tdd
description: Fix a tRPC bug test-first. Reproduce it with a regression test that runs a real client against a real server and fails without the fix, then make the fix and write the PR's "Regression check" line. Use when fixing a bug or a GitHub issue, writing a regression test, or adding or changing tests in packages/.
---

# Bug fixes, test first

Adapted from pstack's [TDD skill](https://github.com/cursor/plugins/blob/main/pstack/skills/tdd/SKILL.md).

## Steps

1. **Reproduce.** Pin down the intended behaviour, the current behaviour and the smallest reproduction, often the issue's own.
2. **Write the failing test.** Put it in `packages/tests/server/regression/issue-<number>-<slug>.test.ts`, or beside the code's existing tests (the legacy React package has `packages/react-query/test/regression/`). Test through a real client and server:

   ```ts
   await using ctx = testServerAndClientResource(router);
   ```

   `testServerAndClientResource` is in `@trpc/client/__tests__/testClientResource`. The React packages each have their own helpers; copy the setup from the nearest test. Mock only what can't run locally.

3. **Watch it fail** for the right reason: `pnpm vitest run <file>` from the repo root. If it passes, or fails for another reason, fix the test before touching the code.
4. **Fix** with the smallest change that keeps nearby behaviour.
5. **Rerun** the test, then the tests around it.
6. **Write the PR's** `Regression check:` line: the test's name and what it catches without the fix.

## Rules

- Assert the intended behaviour, not the current implementation.
- Add tests; don't rewrite or weaken existing ones to fit a change, unless the expected behaviour really changed and the PR says why.
- In new tests, wait on a condition with `vi.waitFor` rather than a fixed sleep.
