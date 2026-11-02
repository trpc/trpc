# One Turborepo task graph runs and caches every package's tasks, locally and in Vercel's remote cache (human asked)

- Human, 2026-10-20 (via the coordinator): "Run per-package `typecheck` through `vp run --cache` (exclude `.tsbuildinfo` outputs) and persist `node_modules/.vite/task-cache` across CI runs with `actions/cache`." "No Turbo." Superseded by:
- Human, 2026-11-01 (via the coordinator): "and we can use turbo or vite caching whatever fits best. don't be lazy, but do the best thing for the future on that"
- (agent) Turborepo, for the one workspace ([`one-workspace.md`](./one-workspace.md)). The root's `turbo.json` has every package's `build`, `typecheck`, `lint` and `test`. The root's `pnpm build`, `typecheck`, `lint`, `test` and `check:www`, `next/`'s `pnpm build` and `typecheck`, and v11's scripts all run through it.
  - The local cache is `.turbo/cache`.
  - CI's jobs (`next.yml`'s and `v11-ci.yml`'s) and Vercel's builds of the site share Vercel's remote cache: `TURBO_TOKEN` and `TURBO_TEAM` (`trpc`). So a task that an earlier run already ran with the same inputs replays its logs and outputs.
- (agent) Why Turborepo, not Vite Task:
  - **A remote cache.** A released `vp` has none, so each CI job would restore and save its own `actions/cache`. Turborepo's is already Vercel's, and v11's CI used it before the merge.
  - **One graph for both versions.** v11's scripts and workflows, like `main`'s, run turbo, and v11 doesn't use Vite+. Moving v11 to `vp run` would be churn in code deleted at 12.0.0 ([`v11-stays-until-12.md`](./v11-stays-until-12.md)), and it would conflict with every merge from `main`.
  - **Edges the workspace can't see.** `dependsOn` adds dependencies that aren't in a `package.json`: the site's build after the packages it compiles, and v11's examples that run their `client/` and `server/` with `npm run -w`.
  - Vitest's own cache isn't a task cache: it orders the tests and reruns the failed ones.
- (agent) A task's hash covers:
  - its package's git-tracked files;
  - the hashes of the tasks it depends on;
  - its dependencies' entries in the lockfile, so `effect-latest`'s `pnpm update` never replays `check`'s results;
  - its `env`.

  A task that reads files outside its package lists them in `inputs`: `www#build` the decisions and the oRPC parity docs, and `trpc-next#test`, `coverage` and `test:rest` (one Vitest run over all of `next/`) the v12 docs and `www/src/site.ts`. `globalDependencies` lists the configs every v11 task reads.

- (agent) Timings, local, on 4 cores:
  - **Before (two workspaces).** `next/`'s `pnpm typecheck` through Vite Task: 29 s cold, 1 s warm. `next/`'s `pnpm build` (its packages and the site): 307 s cold, 54 s warm. v11: `pnpm build` 5 s, `pnpm typecheck-packages` 8 s, tests 93 s. `next/`'s tests: about 60 s.
  - **After (one graph).** The root's `pnpm typecheck` (82 tasks: v11's packages and tooling, `next/`, the site and `tooling/`): 35 s cold, 0.1 s warm. The root's `pnpm build` (28 tasks, the site included): 77 s cold with the Twoslash cache warm (about 8 minutes with it empty), 66 s when only the site changed, under 1 s warm. The root's `pnpm test` (v11's, `next/`'s and the site's Vitest runs): 164 s cold, one run at a time as each uses every core, and 0.1 s warm. The root's `pnpm lint`: 26 s cold, 0.1 s warm.
  - **CI before.** `next.yml`: `check` 261 s, `www` 820 s, `www-trpc-io` 397 s. `v11-ci.yml`: `typecheck` 66 s, `build` 66 s (5 of 7 tasks from the remote cache), the tests 205 s, and `typecheck-www` 194 s. `typecheck-www` is gone: `next.yml`'s `www` job checks the site.
- Lost:
  - Vite Task's traced inputs. It recorded the files each `tsc` read. Turborepo hashes what a package declares, so a task that reads outside its package without `inputs` can replay a stale result. `--force` reruns everything.
  - Fine-grained test caching. `trpc-next#test` and `root#test` are one task each, so any change under `next/` reruns all of `next/`'s tests. A task per package would be one Vitest process each, and slower cold.
  - `www#build`'s `env` has the commit (`GITHUB_SHA`, `VERCEL_GIT_COMMIT_SHA`) for Sentry's release, so CI never replays the site's build. The Twoslash cache (`www/node_modules/.cache`, in `actions/cache`) is what keeps that build fast.
- Open: per-package test tasks, if `next/`'s test run becomes the slow part of CI.
- Lives in: `turbo.json`, `package.json`, `next/package.json`, `.github/workflows/next.yml`, `.github/workflows/v11-ci.yml`.
