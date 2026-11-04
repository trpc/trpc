# Agent instructions

`main` is tRPC v11; v12 is a rewrite on the [`v12`](https://github.com/trpc/trpc/tree/v12) branch. Skills live in `.agents/skills/` (`.claude/skills` links there); don't add a `.cursor/` folder.

## Commands

Run them from the repo root.

- One test file: `pnpm vitest run <file>`. `pnpm test -- <file>` ignores the file and runs the whole suite. Tests import `@trpc/*` from source, so they don't need a build.
- Typecheck: `pnpm typecheck-packages`. Lint and format: `pnpm lint-fix`. Docs code blocks: `pnpm --filter www check-twoslash`.

## Layout

- `packages/*`: the `@trpc/*` packages. Most integration tests are in `packages/tests/server/`.
- `www/v11/docs/<path>.md`: the docs, served at `/docs/<path>`.
- `packages/*/skills/` are generated from docs frontmatter when packing; edit the docs page instead.

## Rules

- Every bug fix has a regression test that fails without the fix, and a `Regression check:` line in the PR naming it.
- No behaviour-changing defaults in v11: add an opt-in option or docs, and put the new default in v12. Port v11 fixes to `next/` on the `v12` branch, following its `next/AGENTS.md`.
- Internal (non-exported) parameters, properties and options are required: pass `null`, a literal or a symbol. Optionals are only for public APIs.
- PR bodies follow [the template](.github/PULL_REQUEST_TEMPLATE.md): under 200 words of bullets, one `- Closes #N` per issue, and the AI model if one helped. No file-by-file changelogs, test lists or review history.

## Skills

- [`tdd`](.agents/skills/tdd/SKILL.md): fixing a bug or writing tests.
- [`typescript`](.agents/skills/typescript/SKILL.md): writing or reviewing TypeScript in `packages/`.
