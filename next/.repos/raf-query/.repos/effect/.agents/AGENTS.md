This is the Effect TypeScript monorepo. The git base branch is `main`; use `pnpm` from the repository root.

## Layout

- Core library source, runtime tests, and type tests are in `packages/effect/src`, `packages/effect/test`, and
  `packages/effect/typetest`.
- Other package families include `packages/ai`, `packages/atom`, `packages/platform`, `packages/sql`, and
  `packages/tools`; standalone packages also live directly under `packages`.
- Package tests and type tests live beside source in `test` and `typetest` directories.
- AI documentation sources are in `ai-docs/src`.
- Changesets are in `.changeset`.
- Migration sources (v3-to-v4) are in `migration/annotations`.
- Inspect nearby code before editing.

## Validation

Use the narrowest validation that covers the change:

| Change type                        | Validation                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| Runtime source or test changes     | `pnpm lint-fix`, targeted `pnpm test --run <test_file.ts>`, `pnpm check`           |
| Type-system behavior or type tests | Targeted `pnpm test-types <filename>`, plus `pnpm check` when source types changed |
| JSDoc text/category/link changes   | `pnpm jsdocs --check`, `pnpm lint`                                                 |
| JSDoc example changes              | `pnpm jsdocs --check`, `pnpm lint`, root `pnpm doctest --run <files>`              |
| Docs-only changes                  | `pnpm lint-fix`; no tests unless examples or code changed                          |

Choose coverage from the contract being changed. Runtime tests cover executed
behavior. Tstyche tests cover intended compiler behavior such as inference,
assignability, rejection, or displayed public types. An ordinary source edit or
exported declaration is covered by `pnpm check` unless compiler behavior is part
of the task.

Never run bare `pnpm test` or `pnpm doctest`; both start the full suite in watch mode. Always pass `--run` and the
specific files covering the change. CI runs the full suite.

For an ad hoc runnable probe, create `scratchpad/<name>.ts`, run it with plain `node`, and remove it when finished.

Report any commands that could not be run.

## Generated Files

Do not edit generated output directly.

Some `index.ts` sections marked with `@barrel` are generated. Do not edit those
sections manually; update their source modules and run `pnpm codegen`.
Hand-maintained `index.ts` files and unmarked sections are not covered by this
rule.

`LLMS.md` is generated from `ai-docs/src`, and `migration/v3-to-v4.md` is
generated from `migration/annotations`. Update checked-in third-party assets
through their generator or documented import procedure.
