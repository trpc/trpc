# Agents (`next/`)

## Rewrite in progress

This repo is a **from-scratch rewrite** of tRPC (vNext / `v12` branch), not maintenance of current tRPC.

**New code lives here, in `next/`.** Do not add vNext packages to the repo-root `packages/`, `examples/` or `www/` trees (that is leftover v11). Design docs live in [`.agent-docs/`](./.agent-docs/).

Start here (paths relative to `next/`):

- `.agent-docs/decisions/brief.md` — the brief and founding constraints
- `README.md` — implementation root layout and commands
- `.agent-docs/approach.md` — process, principles, phases
- `.agent-docs/README.md` — proposal index and how to decide
- `.agent-docs/proposals/` — API proposals (options + recommendations; a human decides)
- `.agent-docs/decisions/` — one file per decided topic, titled `(human)` or `(agent)`; overrides proposals (`pnpm decisions` lists and searches them; `--who agent` shows the unreviewed calls)
- `.agent-docs/reference/` — oRPC parity, v11 inventory, prior art
- `.agent-docs/notes/` — spike results and research
- `spikes/` — throwaway prototypes backing the notes

Search `.agent-docs/` before designing or implementing. Do not silently diverge from a recorded decision, and don't reverse a `(human)` one without asking. A new decision is a new `decisions/<topic>.md`, not an addition to an existing file or an index; the format is in `.agent-docs/README.md#decisions`. Do not fill Decision blocks in proposals; humans record decisions.

All logic is written in Effect, including tooling, scripts, tests' helpers and spikes ([`decisions/effect-native-by-default.md`](./.agent-docs/decisions/effect-native-by-default.md), the [brief](./.agent-docs/decisions/brief.md)). The exceptions are public APIs that promise users a Promise surface, and code whose host fixes the shape (an oxlint rule's visitor object); keep Effect behind those. Spike scripts share `spikes/kit.ts` (fixtures through `FileSystem`, `tsc` through `ChildProcessSpawner`, commands through `effect/cli`).

Agent skills live in the repo-root `.agents/skills/<name>/SKILL.md` (for example `decision-round`). Never use `.cursor/`.

## Running

`next/` is its own pnpm workspace. Node is pinned in `.nvmrc` (same version as the repo-root `.nvmrc`). From `next/`:

```bash
nvm use
pnpm install
pnpm test
pnpm example
```

`pnpm typecheck` and `pnpm check` are the other local gates (`pnpm fix` autofixes). Commands are listed in `README.md`. If `node -v` is not 24.x, run `nvm use` before install or test.

## Vendored Source

Source for this project's key dependencies is vendored under `.repos/`, pinned to the installed versions. When a question is about how one of these libraries actually behaves, read its vendored source — implementation, tests, examples — instead of relying on docs, memory, or web search. The trees are read-only reference material; see `.repos/AGENTS.md` before touching or citing them.

### Vendored packages

- `effect` (ref `effect@4.0.2`) → `.repos/effect`
- `orpc` (ref `v2.0.0-beta.44`) → `.repos/orpc`
- `raf-query` (ref `a9f2aa77`, 0.11.1) → `.repos/raf-query`

Managed by [vendor-src](https://www.npmjs.com/package/vendor-src), a devDependency of this workspace (`pnpm install` runs `vendor-src check`; `pnpm vendor:sync` updates the trees). Its config has to live at the repo root (`../vendor-src.json`, `"dir": "next/.repos"`), because vendor-src looks for the nearest directory with both `.git` and `package.json`. `rootAgentsMd` is off, so keep the list above in sync by hand when adding or bumping a vendored repo.
