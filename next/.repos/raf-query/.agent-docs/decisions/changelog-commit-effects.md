# Changelog only from publishable package commits (agent)

- Release notes and the recommended bump use the same path as the release gate: `packages/*` (`.release-it.json` → `git.commitsPath`, `commitsOpts.path`, `gitRawCommitsOpts.path`). Docs, examples, CI, agent docs, and `.experimental/*` alone stay out even when they land in the same tag range.
- Experiments live under top-level `.experimental/` (see [experiment-tanstack-react-query.md](./experiment-tanstack-react-query.md)), so `packages/*` means the same thing as a shell glob and as a git pathspec.
- **The path decides relevance, not the commit type** (human): a `refactor` / `chore` / `docs` commit that touches `packages/*` is in the notes under its own section. No type is `effect: "hidden"`; `feat` / `fix` / `perf` are `effect: "bump"`, the rest `effect: "changelog"` (in the notes, no bump). conventional-changelog v10 reads `effect`, not the old `hidden: true`. In CI, a range with no bump type still releases as a patch (release-it's CI default).
- Guarded by `tooling/pr-title`'s sync test against `.release-it.json`.
