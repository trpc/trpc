# Tests live beside the code they show (agent)

- Human, 2026-10-17: "tests should be contextual and sit in places close to the code their testing", "i don't think /next/test should exist at all", "i like reading tests as a sort of documentation on how to use stuff" and "you shouldn't copy what "old" trpc does in terms of testing but suggest a structure and rules".
- (agent, tentative) The proposal's starred picks, until the human answers [proposal 23](../proposals/23-test-layout.md):
  - Q23.1: tests sit beside the module, `src/<area>/<module>.test.ts`.
  - Q23.2: `<module>.test.ts` reads as a guide; edge cases go in `<module>-edges.test.ts`.
  - Q23.3: a fixture shared across packages lives in the package the others build on (`tanstack-query/src/fixtures/`), imported by relative path.
  - Q23.4: the Bun smoke is `packages/trpc/src/http/serve.bun.test.ts`, run by `bun test` and skipped by Vitest.
  - Q23.5: the portability check moves to `tooling/portability`; the recipes move to `examples/integrations/`.
  - Q23.6: two tsconfigs per package, `tsconfig.json` for the library and `tsconfig.test.json` for tests and fixtures.
  - Q23.7: docs sections link to the test that proves them.
- Why: a reader who opens a package sees how to use it; a test moves, and is deleted, with its module.
- Lost: one `test/` tree to run on its own; test-only dependencies kept out of library packages.
- Open: awaiting the human's answers to proposal 23; no test has moved yet.
- Lives in: `proposals/23-test-layout.md`.
