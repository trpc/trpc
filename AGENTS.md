# Agent instructions

**On the `v12` branch, work focuses on v12, in [`next/`](./next/AGENTS.md), until it becomes `main`.** Read [`next/AGENTS.md`](./next/AGENTS.md) first. Push to `v12` directly, with no pull requests against it, from any folder ([Landing on `v12`](./next/AGENTS.md#landing-on-v12)).

## Layout

The root is one pnpm workspace, with one lockfile and one `turbo.json` ([`one-workspace.md`](./next/.agent-docs/decisions/one-workspace.md)). `pnpm install` anywhere installs all of it.

- [`next/`](./next/AGENTS.md): v12, the `@trpc12/*` packages, and their design docs in `next/.agent-docs/`.
- [`v11/`](./v11/AGENTS.md): v11, the `@trpc/*` packages and examples, with the `v11-*` workflows, kept working and released until 12.0.0 ([`v11-stays-until-12.md`](./next/.agent-docs/decisions/v11-stays-until-12.md)). Don't add v12 code there ([`v11-folder.md`](./next/.agent-docs/decisions/v11-folder.md)).
- [`www/`](./www/AGENTS.md): trpc.io's site, serving every version's docs: v12's in `www/v12/docs/`, v11's in `www/v11/docs/`. v11's, v10's, v9's docs and the blog are edited on `main`.
- `tooling/`: what v11, v12 and the site share (`tooling/ui`, `tooling/subtree`). Tooling for one version is in its own folder's `tooling/`.
- `examples/`: only `vercel.json` stubs, so the v11 Vercel projects, whose root directories are still those paths, skip this branch and its branches. `main` keeps the real configs, and the stubs go at the cutover ([`v11-folder.md`](./next/.agent-docs/decisions/v11-folder.md)). Anything else there in a checkout is an ignored leftover; delete it.

## Commands

At the root, `pnpm build`, `typecheck`, `lint` and `test` run every package's through turbo, cached locally and in CI ([`task-cache.md`](./next/.agent-docs/decisions/task-cache.md)), and `pnpm check:www` checks the site and `tooling/`. Each version's own commands and gates are in its `AGENTS.md`.

## Skills

Skills live in `.agents/skills/`. One we write also needs a `.claude/skills/<name>` symlink and a `!` entry in `.oxfmtrc.json`; installed ones get their link from `npx skills add` and stay unformatted. Don't add a `.cursor/` folder. Read the matching one before starting:

- [`decision-round`](.agents/skills/decision-round/SKILL.md): going through v12's open decisions with a human.
- [`trpc-conventions`](.agents/skills/trpc-conventions/SKILL.md): fixing a bug, writing tests or writing TypeScript in `v11/packages/`. It wins where the skills below disagree.
- [`pr-agent-callout`](.agents/skills/pr-agent-callout/SKILL.md): working on a pull request.
- [`tdd`](.agents/skills/tdd/SKILL.md): fixing a bug.
- [`typescript-best-practices`](.agents/skills/typescript-best-practices/SKILL.md) and [`principle-type-system-discipline`](.agents/skills/principle-type-system-discipline/SKILL.md): writing or reviewing TypeScript.
- [`principle-boundary-discipline`](.agents/skills/principle-boundary-discipline/SKILL.md): validation, error handling or adapters.
- [`principle-encode-lessons-in-structure`](.agents/skills/principle-encode-lessons-in-structure/SKILL.md): turning a repeated review comment into a lint, type or check.

`tdd`, `typescript-best-practices` and the `principle-*` skills are Lauren Tan's pstack skills, installed unchanged by the [`skills`](https://skills.sh) CLI and pinned in `skills-lock.json`; their MIT license is in [`NOTICE-pstack.md`](.agents/skills/NOTICE-pstack.md). Don't edit them. To update, rerun at the root with a new commit and update the notice:

`npx skills add https://github.com/cursor/plugins/tree/<sha>/pstack/skills --skill tdd typescript-best-practices principle-type-system-discipline principle-boundary-discipline principle-encode-lessons-in-structure -a claude-code codex cursor -y`
