# Agent instructions

`main` is tRPC v11; v12 is a rewrite on the [`v12`](https://github.com/trpc/trpc/tree/v12) branch. Skills live in `.agents/skills/`. One we write also needs a `.claude/skills/<name>` symlink and a `!` entry in `.oxfmtrc.json`; installed ones get their link from `npx skills add` and stay unformatted. Don't add a `.cursor/` folder.

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
- While you work on a PR, follow [`pr-agent-callout`](.agents/skills/pr-agent-callout/SKILL.md): its body starts with a callout saying what you're doing, until you stop planning to push.
- CodeRabbit usually reviews a PR within about 15 minutes of each push. Before you finish, wait for its review of your last push, then fix or answer its comments.
- PR bodies follow [the template](.github/PULL_REQUEST_TEMPLATE.md): under 200 words of bullets, one `- Closes #N` per issue, and the AI model if one helped. Keep credits: `Co-authored-by:` lines, contributor credit and AI disclosures. Drop file-by-file changelogs, test lists, thank-you notes and review history.

## Skills (read the matching one before starting)

- [`trpc-conventions`](.agents/skills/trpc-conventions/SKILL.md): fixing a bug, writing tests or writing TypeScript in `packages/`. It wins where the skills below disagree.
- [`tdd`](.agents/skills/tdd/SKILL.md): fixing a bug.
- [`typescript-best-practices`](.agents/skills/typescript-best-practices/SKILL.md) and [`principle-type-system-discipline`](.agents/skills/principle-type-system-discipline/SKILL.md): writing or reviewing TypeScript.
- [`principle-boundary-discipline`](.agents/skills/principle-boundary-discipline/SKILL.md): validation, error handling or adapters.
- [`principle-encode-lessons-in-structure`](.agents/skills/principle-encode-lessons-in-structure/SKILL.md): turning a repeated review comment into a lint, type or check.

All but `trpc-conventions` and `pr-agent-callout` are Lauren Tan's pstack skills, installed unchanged by the [`skills`](https://skills.sh) CLI and pinned in `skills-lock.json`; their MIT license is in [`NOTICE-pstack.md`](.agents/skills/NOTICE-pstack.md). Don't edit them. To update, rerun with a new commit and update the notice:

`npx skills add https://github.com/cursor/plugins/tree/<sha>/pstack/skills --skill tdd typescript-best-practices principle-type-system-discipline principle-boundary-discipline principle-encode-lessons-in-structure -a claude-code codex cursor -y`
