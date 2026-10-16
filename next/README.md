# `next/` — tRPC vNext code root

All **implementation** for the rewrite lives here. The old v11 tree at the repo root (`packages/`, `examples/`, `www/`, …) is reference only until it is deleted.

Agents: start with [`AGENTS.md`](./AGENTS.md). Design docs live in [`.agent-docs/`](./.agent-docs/). Brief: [`ideas.md`](./ideas.md).

```text
next/
  AGENTS.md             agent instructions for this code root
  ideas.md              brief and constraints
  .agent-docs/          proposals, decisions, reference, spike notes (design only)
  .repos/               vendored dependency source (vendor-src, read-only)
  packages/trpcdev/     core package (ideas.md: single `trpcdev` package)
  packages/tanstack-query/  `@trpcdev/tanstack-query`: framework-agnostic TanStack Query helpers
  packages/tanstack-*-query/  `@trpcdev/tanstack-{react,preact,vue,solid,svelte,angular,lit}-query`: one package per TanStack adapter
  packages/upgrade/     `@trpcdev/upgrade`: the v11 → v12 codemod (`trpcdev-upgrade` bin)
  examples/             workspace-linked examples
  test/integration/     integration tests: real clients against real HTTP servers
  test/tanstack-query/  TanStack Query tests: real components per adapter (happy-dom) against real servers
  test/portability/     TS2742/TS2883 fixture (emits declarations)
  spikes/               throwaway experiments; results in .agent-docs/notes/
  docs/                 Markdown user docs (later)
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

| Command          | What it does                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`   | Installs deps; `prepare` installs the git hook dispatcher                                                                     |
| `pnpm typecheck` | `tsc` (TypeScript 7) in every workspace package                                                                               |
| `pnpm check`     | `vp check`: format check, lint and type-aware lint/type check                                                                 |
| `pnpm fix`       | `vp check --fix`: format and autofix                                                                                          |
| `pnpm test`      | `vp test run`: Vitest, including `*.test-d.ts` type tests                                                                     |
| `pnpm example`   | Runs every example's `smoke` script (`examples/*`; `realtime` needs Redis at `REDIS_URL`)                                     |
| `pnpm build`     | `vp pack` per package (`tooling/pack/`): unbundled ESM and declarations in `dist/`, published through `publishConfig.exports` |

`trpcdev` entry points: `/server` (builder, routers, `t.implement`, the fetch handler with `.websocket()` and `.messagePort()`, callers), `/client` (typed client and links, including `wsLink`, `messagePortLink` and `dedupeLink`), `/contract` (`contract.create`, `toContract`), `/openapi` (REST handler, `generateOpenApi`, reference UI, `openApiLink`), `/effect` (Effect client), `/serializer` (danSON), `/http` (`serve`/`toHttpEffect`: the handler and WebSocket upgrades on Effect's `HttpServer`), `/middleware` (`onStart`, `onSuccess`, `onError`, `onFinish`), `/actions` (`createAction`, `createCallable`: procedures as plain functions for React Server Actions, taking `FormData` too), `/testing` (`createTestServer({ http })`), `/extend` (building blocks for integrations: `createUntypedClient`, `runLinks`, `callProcedure`, the wire format) and `/internal` (types declaration emit refers to; no semver). `trpcdev` imports no `node:*`: Node comes from `NodeHttpServer.layer` in `@effect/platform-node` ([decision](./.agent-docs/decisions/platforms-through-effect-layers.md)). Run one test file with `pnpm vp test run test/integration/<name>`.

`@trpcdev/tanstack-query` (`createTrpcQueryUtils({ client })` for query, infinite, mutation, streamed and live options, keys and filters; `SubscriptionObserver`; `hydrationOptions`) plus one package per official TanStack adapter, re-exporting it with context helpers and a subscription primitive: `@trpcdev/tanstack-react-query`, `-preact-query`, `-vue-query`, `-solid-query`, `-svelte-query`, `-angular-query` and `-lit-query` ([decision](./.agent-docs/decisions/integration-packages.md)). `@trpcdev/tanstack-react-query/rsc` has `createTrpcRsc` for React Server Components: a per-request caller and query client, `prefetch`, and a server `HydrationBoundary`. Solid and Svelte tests run as their own Vitest projects with browser conditions (`--project solid`, `--project svelte`).

**Pre-commit:** `.vite-hooks/pre-commit` runs `vp staged` (see `staged` in `vite.config.ts`): `vp check --fix` on staged files under `next/`, plus `vp test related` for staged `.ts` files. `pnpm install` enables it via `vp config` unless `core.hooksPath` is already set to something else. Skip once with `VP_GIT_HOOKS=0 git commit …`.

**CI:** `../.github/workflows/next.yml` runs `typecheck`, `check`, `test` and `example` for changes under `next/`. Root v11 workflows are untouched.
