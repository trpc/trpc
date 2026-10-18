# `next/` — tRPC vNext code root

All **implementation** for the rewrite lives here. The old v11 tree at the repo root (`packages/`, `examples/`, `www/`, …) is reference only until it is deleted.

Agents: start with [`AGENTS.md`](./AGENTS.md). Design docs live in [`.agent-docs/`](./.agent-docs/). Brief: [`.agent-docs/decisions/brief.md`](./.agent-docs/decisions/brief.md).

```text
next/
  AGENTS.md             agent instructions for this code root
  .agent-docs/          proposals, decisions, reference, spike notes (design only)
  .repos/               vendored dependency source (vendor-src, read-only)
  packages/trpc/     core package (the brief: single `@trpc12/trpc` package)
  packages/tanstack-query/  `@trpc12/tanstack-query`: framework-agnostic TanStack Query helpers
  packages/tanstack-*-query/  `@trpc12/tanstack-{react,preact,vue,solid,svelte,angular,lit}-query`: one package per TanStack adapter
  packages/experimental-react/       `@trpc12/experimental-react`: stable `use()` promises, features as links
  packages/experimental-react-atom/  `@trpc12/experimental-react-atom`: queries and mutations as Effect Atoms
  packages/upgrade/     `@trpc12/upgrade`: the v11 → v12 codemod (`trpc12-upgrade` bin)
  packages/nest/        `@trpc12/nest`: contracts implemented in NestJS controllers (`@experimental_Implement`, `experimental_TrpcModule`)
  examples/             workspace-linked examples
  packages/*/src/**/*.test.ts  tests beside the code they show; shared fixtures in `src/**/fixtures/`
  test/integration/     recipes with third-party libraries (AI SDK, Better Auth, Firebase callable, publisher backends)
  spikes/               throwaway experiments; results in .agent-docs/notes/
  shared/ui/            `@shared/ui`: vanilla shadcn components for the docs site; the tRPC brand is in its globals.css
  tooling/portability/  TS2742/TS2883 check: a consumer package that emits declarations
  tooling/tsconfig/     `@tooling/tsconfig`: the shared, strictest tsconfigs every package, suite and tool extends (examples stay standalone)
  tooling/docs-lint/    lints the code blocks in docs/ (oxlint skips Markdown)
  tooling/vercel-ignore/  Vercel's ignored build step for the docs site: skips a deployment when nothing it renders changed
  docs/                 Markdown user docs, a folder per sidebar section (index: docs/README.md)
  www/                  `@trpc12/www`: the docs site, rendered from docs/ with compiled twoslash examples
  www/samples/          the apps the docs' and home page's code blocks compile in
```

Work inside this folder (`cd next`). Use its own `pnpm-workspace.yaml`; do not add new vNext packages to the root workspace.

## Tooling

[Vite+](https://viteplus.dev) (`vite-plus`, CLI `vp`) bundles Vitest, Oxlint, Oxfmt and tsdown. Config lives in `vite.config.ts`. Requires Node ≥ 24.11.

Node is pinned in `.nvmrc` (`24.21.0`, same version as the repo root). From this directory, `nvm use` selects it even when `next/` is the workspace root. Then:

```bash
nvm use
pnpm install
pnpm test
pnpm example
```

| Command             | What it does                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`      | Installs deps; `prepare` installs the git hook dispatcher                                                                                                |
| `pnpm typecheck`    | `tsc` (TypeScript 7) in every workspace package                                                                                                          |
| `pnpm check`        | `vp check`: format check, lint and type-aware lint/type check; then `pnpm lint:docs`                                                                     |
| `pnpm lint:docs`    | Lints the code blocks in `docs/` with the rules that hold for examples (`tooling/docs-lint/`), since oxlint skips Markdown                               |
| `pnpm fix`          | `vp check --fix`: format and autofix                                                                                                                     |
| `pnpm test`         | `vp test run`: Vitest, including `*.test-d.ts` type tests                                                                                                |
| `pnpm coverage`     | `pnpm test` with v8 coverage over `packages/*/src`; fails below 98% statements, branches, functions or lines                                             |
| `pnpm test:bun`     | `@trpc12/trpc`'s Bun tests (`*.bun.test.ts`); needs `bun` on `PATH`                                                                                      |
| `pnpm example`      | Runs every example's `smoke` script (`examples/*`; `realtime` needs Redis at `REDIS_URL`)                                                                |
| `pnpm build`        | `vp pack` per package (`tooling/pack/`): unbundled ESM and declarations in `dist/`, published through `publishConfig.exports`; also builds the docs site |
| `pnpm docs:dev`     | The docs site at http://localhost:3012, reloading as `docs/` changes                                                                                     |
| `pnpm docs:build`   | Prerenders the site to `www/dist/client`, and its Vercel output to `www/.vercel/output`; fails on a type error in a twoslash block or a broken link      |
| `pnpm bench budget` | Gzip size of the client bundles; fails above a ceiling in `budgets` (`tooling/bench/bench.ts`)                                                           |

Run all of them before pushing: `pnpm fix`, `pnpm check`, `pnpm typecheck`, `pnpm coverage` (which runs `pnpm test`), `pnpm test:bun`, `pnpm example`, `pnpm build` (which builds the docs site too) and `pnpm bench budget`. When a change shrinks a client bundle, lower its `ceiling` to the new size; never raise one without saying so in the PR.

`@trpc12/trpc` entry points: `/server` (builder, routers, `t.implement`, the fetch handler with `.websocket()` and `.messagePort()`, callers), `/client` (typed client and links, including `wsLink`, `experimental_messagePortLink` and `dedupeLink`), `/contract` (`contract.create`, `toContract`), `/openapi` (REST handler, `generateOpenApi`, reference UI, `openApiLink`), `/effect` (Effect client), `/serializer` (danSON), `/http` (`serve`/`toHttpEffect`: the handler and WebSocket upgrades on Effect's `HttpServer`), `/middleware` (`onStart`, `onSuccess`, `onError`, `onFinish`), `/actions` (`experimental_createAction`, `experimental_createCallable`: procedures as plain functions for React Server Actions, taking `FormData` too), `/testing` (`createTestServer({ http })`), `/extend` (building blocks for integrations: `createUntypedClient`, `runLinks`, `callProcedure`, the wire format) and `/internal` (types declaration emit refers to; no semver). `@trpc12/trpc` imports no `node:*`: Node comes from `NodeHttpServer.layer` in `@effect/platform-node` ([decision](./.agent-docs/decisions/platforms-through-effect-layers.md)). Run one test file with `pnpm vp test run packages/trpc/src/<area>/<name>`.

`@trpc12/tanstack-query` (`createTrpcQueryUtils({ client })` for query, infinite, mutation, streamed and live options, keys and filters; `SubscriptionObserver`; `hydrationOptions`) plus one package per official TanStack adapter, re-exporting it with context helpers and a subscription primitive: `@trpc12/tanstack-react-query`, `-preact-query`, `-vue-query`, `-solid-query`, `-svelte-query`, `-angular-query` and `-lit-query` ([decision](./.agent-docs/decisions/integration-packages.md)). `@trpc12/tanstack-react-query/rsc` has `createTrpcRsc` for React Server Components: a per-request caller and query client, `prefetch`, and a server `HydrationBoundary`. Solid and Svelte tests run as their own Vitest projects with browser conditions (`--project solid`, `--project svelte`).

React without TanStack, both experimental as whole packages ([docs](./docs/integrations/experimental-react.md), [decision](./.agent-docs/decisions/react-use-package.md)): `@trpc12/experimental-react` (`createReactClient`: loaders call `.query()` for stable, `use()`-ready promises; `useQuery`, `useQueryState`; caching, structural sharing, refetching and retries as opt-in links, all of them in `standardLinks()`; `dehydrate`/`hydrate`) and `@trpc12/experimental-react-atom` (`createAtomClient`: query, mutation and subscription atoms on `effect/reactivity`, hydrated through the links' serializer).

**Pre-commit:** `.vite-hooks/pre-commit` runs `vp staged` (see `staged` in `vite.config.ts`): `vp check --fix` on staged files under `next/`, plus `vp test related` for staged `.ts` files. `.vite-hooks/post-merge` reruns `pnpm --filter @trpc12/www old-docs:copy` when a merge changed the root's `www/`, and `pnpm --filter @trpc12/www sponsors:readme` when it changed the root's `README.md`. `pnpm install` enables it via `vp config` unless `core.hooksPath` is already set to something else. Skip once with `VP_GIT_HOOKS=0 git commit …`.

**CI:** `../.github/workflows/next.yml` runs for changes under `next/` and the root's `www/` (which the docs site copies, checked by `pnpm --filter @trpc12/www old-docs:check`): `typecheck`, `check`, `coverage`, `example` (with Redis) and `bench budget`; `typecheck` and `test` against the latest `effect@4.x`; and `test:bun`. `fix` and `build` aren't in CI, so run them locally. After pushing, find the run with `gh run list --workflow next.yml --branch <branch>` and watch it with `gh run watch <id> --exit-status`. Root v11 workflows are untouched.
