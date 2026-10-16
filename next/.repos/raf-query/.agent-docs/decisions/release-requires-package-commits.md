# Release only when publishable packages change (human)

- Push to `main` still runs the Release workflow, but release-it skips unless there is a commit since the latest tag that touches `packages/*` (`git.commitsPath` in `.release-it.json`, with the existing `requireCommits` check).
- The glob is left unquoted so the shell expands it (release-it runs the rev-list via `exec`); that matches `packages/core` and `packages/react`, same as the root `./packages/*` filters. Experiments live under top-level `.experimental/`, so they are outside this path whether the consumer is a shell glob or a git pathspec.
- Docs, examples, agent docs, tooling, and `.experimental/*` alone must not publish a new npm version. That is why [0142c6ef](https://github.com/KATT/raf-query/commit/0142c6ef9448631c6239fff4a4ddf16db02b35de) (`chore(examples)` placeholder) cut 0.7.7 with no library change.
- Workflow `paths:` filters lost: if a package-changing run stops because `main` moved, the newer commit's run has to release it, and that newer commit may only be docs.
- Lives in `.release-it.json` (`git.commitsPath`), `.github/workflows/release.yaml` (gate job before install/build; release job still treats "no commits since the latest tag" as success), and `.github/DEVELOPMENT.md`.
- The changelog and recommended bump use the same `packages/*` string via `commitsOpts.path` / `gitRawCommitsOpts.path` (see [changelog-commit-effects.md](./changelog-commit-effects.md)).
