# Agent instructions

`v11/` is tRPC v11, `main`'s code; v12 is the rewrite in [`v12/`](../v12/AGENTS.md). The workspace, the shared commands and the skills are in the [root's `AGENTS.md`](../AGENTS.md).

## Commands

Run them from `v11/`.

- One test file: `pnpm vitest run <file>`. `pnpm test -- <file>` ignores the file and runs the whole suite. Tests import `@trpc/*` from source, so they don't need a build.
- Typecheck: `pnpm typecheck-packages`. Lint and format: `pnpm lint-fix`. Docs code blocks: `pnpm --filter www check-twoslash`.

## Layout

- `packages/*`: the `@trpc/*` packages. Most integration tests are in `packages/tests/server/`.
- The root's `www/v11/docs/<path>.md`: the docs, served at `/docs/<path>`.
- `packages/*/skills/` are generated from docs frontmatter when packing; edit the docs page instead.

## Rules

- Every bug fix has a regression test that fails without the fix, and a `Regression check:` line in the PR naming it.
- No behaviour-changing defaults in v11: add an opt-in option or docs, and put the new default in v12. Port v11 fixes to `v12/`, following [`v12/AGENTS.md`](../v12/AGENTS.md).
- Internal (non-exported) parameters, properties and options are required: pass `null`, `undefined`, a literal or a symbol, whichever fits. Optionals are only for public APIs, normalised once at the boundary.
- While you work on a PR, follow [`pr-agent-callout`](../.agents/skills/pr-agent-callout/SKILL.md): its body starts with a callout saying what you're doing, until you stop planning to push.
- CodeRabbit usually reviews a PR within about 15 minutes of each push. Before you finish, wait for its review of your last push, then fix or answer its comments.
- PR bodies follow [the template](../.github/PULL_REQUEST_TEMPLATE.md): under 200 words of bullets, one `- Closes #N` per issue, and the AI model if one helped. Keep credits: `Co-authored-by:` lines, contributor credit and AI disclosures. Drop file-by-file changelogs, test lists, thank-you notes and review history.

## Skills

Read the matching one from the [root's list](../AGENTS.md#skills) before starting. `trpc-conventions` covers `packages/` here.
