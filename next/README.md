# `next/` — tRPC vNext code root

All **implementation** for the rewrite lives here. The old v11 tree, in the repo's `v11/` (`packages/`, `examples/`, `www/`, …), is reference only until it is deleted.

Agents: start with [`AGENTS.md`](./AGENTS.md). Design docs live in [`.agent-docs/`](./.agent-docs/). Brief: [`.agent-docs/decisions/brief.md`](./.agent-docs/decisions/brief.md).

User docs: [v12.trpc.io/v12/docs](https://v12.trpc.io/v12/docs), written in [`www/docs/`](./www/docs/).

```text
next/
  AGENTS.md             agent instructions for this code root
  .agent-docs/          proposals, decisions, reference, spike notes (design only)
  .repos/               vendored dependency source (vendor-src, read-only)
  packages/trpc/     core package (the brief: single `@trpc12/trpc` package)
  packages/tanstack-query/  `@trpc12/tanstack-query`: framework-agnostic TanStack Query helpers
  packages/tanstack-react-query/  `@trpc12/tanstack-react-query`: the React TanStack adapter
  packages/experimental-tanstack-*-query/  `@trpc12/experimental-tanstack-{preact,vue,solid,svelte,angular,lit}-query`: the other adapters, one package each
  packages/experimental-react/       `@trpc12/experimental-react`: stable `use()` promises, features as links
  packages/experimental-react-atom/  `@trpc12/experimental-react-atom`: queries and mutations as Effect Atoms
  packages/experimental-tanstack-db/  `@trpc12/experimental-tanstack-db`: TanStack DB collections synced by a subscription
  packages/upgrade/     `@trpc12/upgrade`: the v11 → v12 codemod (`trpc12-upgrade` bin)
  packages/experimental-nest/        `@trpc12/experimental-nest`: contracts implemented in NestJS controllers (`@Implement`, `TrpcModule`)
  examples/             workspace-linked examples
  packages/*/src/**/*.test.ts  tests beside the code they show; shared fixtures in `src/**/fixtures/`
  test/integration/     recipes with third-party libraries (AI SDK, Better Auth, Firebase callable, publisher backends)
  spikes/               throwaway experiments; results in .agent-docs/notes/
  shared/ui/            `@shared/ui`: vanilla shadcn components for the docs site; the tRPC brand is in its globals.css
  tooling/portability/  TS2742/TS2883 check: a consumer package that emits declarations
  tooling/tsconfig/     `@tooling/tsconfig`: the shared, strictest tsconfigs every package, suite and tool extends (examples stay standalone)
  tooling/docs-lint/    lints the code blocks in www/docs/ (oxlint skips Markdown)
  tooling/vercel-ignore/  Vercel's ignored build step for the docs site: skips a deployment when nothing it renders changed
  tooling/release/      checks the Changesets release plan (`.changeset/config.json`): dependents bump with their dependencies
  www/                  `@trpc12/www`: the docs site, served at https://v12.trpc.io
  www/docs/             the v12 docs: Markdown pages, a folder per sidebar section, with compiled twoslash examples
  www/samples/          the apps the docs' and home page's code blocks compile in
```

Work inside this folder (`cd next`). Use its own `pnpm-workspace.yaml`; do not add new vNext packages to the root workspace.

## Tooling

[Vite+](https://viteplus.dev) (`vite-plus`, CLI `vp`) bundles Vitest, Oxlint, Oxfmt and tsdown. Config lives in `vite.config.ts`. Requires Node ≥ 24.11.

Node is pinned in `.nvmrc` (`24.21.0`, same version as `v11/.nvmrc`). From this directory, `nvm use` selects it even when `next/` is the workspace root. Then:

```bash
nvm use
pnpm install
pnpm test
pnpm example
```

- `pnpm install`: installs deps; `prepare` installs the git hook dispatcher.
- `pnpm typecheck`: `tsc` (TypeScript 7) in every workspace package.
- `pnpm check`: `vp check` (format check, lint and type-aware lint/type check), then `pnpm lint:docs`.
- `pnpm lint:docs`: lints the code blocks in `www/docs/` with the rules that hold for examples (`tooling/docs-lint/`), since oxlint skips Markdown.
- `pnpm fix`: `vp check --fix`, formatting and autofixing.
- `pnpm test`: `vp test run`, Vitest, including `*.test-d.ts` type tests. `pnpm test <file or folder>` runs only those; `--project packages-solid` or `--project packages-svelte` runs those adapters' Vitest projects, which use browser conditions.
- `pnpm coverage`: the packages' tests (the `packages*` Vitest projects: `packages/*/src` and `test/`) with v8 coverage over `packages/*/src`; fails below 98% statements, branches, functions or lines. The docs site, tooling, examples and spikes have no coverage requirement; `pnpm test --project '!packages*'` runs their tests.
- `pnpm test:bun`: `@trpc12/trpc`'s Bun tests (`*.bun.test.ts`); needs `bun` on `PATH`.
- `pnpm example`: runs every example's `smoke` script (`examples/*`). `realtime` needs Redis at `REDIS_URL` and Postgres at `DATABASE_URL`; `runtime-matrix` needs `bun` and `deno`.
- `pnpm build`: `vp pack` per package (`tooling/pack/`): unbundled ESM and declarations in `dist/`, published through `publishConfig.exports`. Also builds the docs site.
- `pnpm docs:dev`: the docs site at http://localhost:3012, reloading as `www/docs/` changes.
- `pnpm docs:build`: prerenders the site to `www/dist/client`, and its Vercel output to `www/.vercel/output`; fails on a type error in a twoslash block or a broken link.
- `pnpm bench budget`: gzip size of the client bundles in `budgets` (`tooling/bench/bench.ts`), against their targets; reports only, never fails.
- `pnpm land`: lands the current branch's commits on `v12`: rebase, reinstall when needed, `vp check` on the changed files, push, retry (`tooling/dev/`).
- `pnpm ci:wait [commit]`: waits for the first finished `next.yml` run on `v12` that includes the commit, and lists its failed jobs.

Run them all before `pnpm land`: `pnpm fix`, `pnpm check`, `pnpm typecheck`, `pnpm coverage` and `pnpm test --project '!packages*'` (together, every test), `pnpm test:bun`, `pnpm example`, `pnpm build` (which builds the docs site too) and `pnpm bench budget`. When a change moves a client bundle's size, update the table in [`.agent-docs/notes/benchmarks.md`](./.agent-docs/notes/benchmarks.md#budgets).

Each package's `README.md` (`packages/<name>/`) says what it exports, and [Packages and stability](https://v12.trpc.io/v12/docs/packages) lists every package and `@trpc12/trpc` entry point with its docs. `@trpc12/trpc` imports no `node:*`: Node comes from `NodeHttpServer.layer` in `@effect/platform-node` ([decision](./.agent-docs/decisions/platforms-through-effect-layers.md)).

**Pre-commit:** `.vite-hooks/pre-commit` runs `vp staged` (see `staged` in `vite.config.ts`): `vp check --fix` on staged files under `next/`, plus `vp test related` for staged `.ts` files. `.vite-hooks/post-merge` reruns `pnpm --filter @trpc12/www sponsors:readme` when a merge changed the root's `README.md`. The old docs copied from `v11/www/` are synced by hand ([`../.agents/skills/sync-old-docs/SKILL.md`](../.agents/skills/sync-old-docs/SKILL.md)). `pnpm install` enables the hooks via `vp config` unless `core.hooksPath` is already set to something else, as it is in Cursor's Cloud Agents. Skip once with `VP_GIT_HOOKS=0 git commit …`.

**CI:** `../.github/workflows/next.yml` runs for changes under `next/`: `typecheck`, `check`, `coverage`, the other tests, `example` (with Redis, Postgres, Bun and Deno) and `bench budget` (sizes in the log, no ceilings); `typecheck` and `test` against the latest `effect@4.x`; and `test:bun`. `fix` and `build` aren't in CI, so run them locally. After landing, `pnpm ci:wait` reports the first finished run that includes your commit. Root v11 workflows are untouched.

**Releases:** [Changesets](https://github.com/changesets/changesets) in `.changeset/`, nothing published yet ([decision](./.agent-docs/decisions/versioning.md)). Each package has its own version, and a bump also releases every package that depends on the bumped one (`dependencies` or `peerDependencies`). Integrations keep `"@trpc12/trpc": "workspace:*"` peers during `0.x`, published as exact versions, so users update `@trpc12/*` together. `pnpm changeset` records a change (`pnpm changeset --minor @trpc12/trpc -m "…"` skips the prompts); a breaking bump, a minor on `0.x`, names each dependent with the same bump, which `tooling/release/release.test.ts` checks. Don't add changesets before the first release, which publishes each package's `0.1.0` as it stands.
