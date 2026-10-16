# AGENTS.md

## Scope

- Read applicable nested `AGENTS.md` files before editing or testing a subtree.
- Shared routing belongs in `packages/router-core`; check React, Solid, and Vue bindings for shared changes. Shared Start runtime/build logic lives in `packages/start-*-core`.

## Work and validation

- Start bug fixes with a failing regression test that uses only public APIs to reproduce and assert user- or developer-visible behavior. Do not manufacture bugs by mutating internals. Establish whether real usage can reach the failing state before adding runtime handling; simplify handling of states proven unreachable.
- For suspected dependency issues, verify the upstream root cause, then propose an upstream fix to the user, including for other `@tanstack/*` packages. **Never implement a workaround in this repository unless the user explicitly authorizes it.**
- During debugging/prototyping, keep fixes aligned with the PR's intended architecture. If making a test pass requires another flag, counter, copied deadline, or duplicate completion authority, stop and consolidate state and ownership. Remove superseded paths instead of accumulating patches and bundle growth.
- Use Node from `.nvmrc` and pnpm from root `package.json`. Install at the root with `CI=1 pnpm install --frozen-lockfile`.
- For sandbox-blocked registry/store access, escalate the same command; report the blocker if unavailable. Do not change stores, delete dependencies/lockfiles, use `--force`/`--ignore-scripts`, or weaken workspace trust/build policies to bypass it.
- Never manually edit `pnpm-lock.yaml` or any `routeTree.gen.ts`. Regenerate the lockfile with `pnpm install --no-frozen-lockfile` after intentional dependency changes; regenerate route trees through app builds/dev servers or the generator fixture harness.
- Always use control-flow braces. Run `pnpm format` before validation.
- Use Nx: workspace imports consume built packages, so direct runners can test stale dependencies. Inspect resolved targets; some are inferred.

```sh
CI=1 NX_DAEMON=false pnpm nx run <project>:<target> --outputStyle=stream --skipRemoteCache
```

- Run one Nx command at a time. For a ~20-second startup/graph stall, stop, run `pnpm nx reset`, and retry once, then escalate. Do not apply that timeout to running tests.
- For code changes, run affected packages' `test:unit`, `test:types`, and `test:eslint` where available, including affected consumers; use `test:e2e` for browser/app behavior and `test:build` for exports/build changes. Root `pnpm test` includes the full e2e suite. Published-code changes require `pnpm changeset`.

## Runtime rules

- Import `isServer` from `@tanstack/router-core/isServer`. Conditional exports select: `development` → `undefined`; server (`workerd`, `worker`, `deno`, `node`, `bun`) → `true` except `NODE_ENV=test` → `undefined`; browser/fallback → `false`. `development` wins; `NODE_ENV=development` alone does not select it.
- Keep `isServer ?? router.isServer` directly in each branch condition for dead-code elimination; negate the whole expression for client branches. Never extract it into a variable (e.g. `const serverRendering = isServer ?? router.isServer`) or helper. Without a router, inline `isServer ?? typeof window === 'undefined'` (or the existing `document` check). Keep the constant first and use `??`, never `||`.
- **Never create UI/router reactivity on the server, including development/tests.** Branch before reactive setup; use direct reads and core non-reactive stores. Required transport listeners are allowed only with request-scoped lifetimes and cleanup.
- Shared route definitions/build metadata must not acquire request/user data. Keep it on the request's Router, context, or QueryClient.
- HMR can replace code while caches and pending work survive. Invalidate derived state or bypass caching in development; reject stale async results while preserving intentional HMR identities/state.
- Gate developer diagnostics and message construction with direct `process.env.NODE_ENV !== 'production'` checks. Preserve required validation/throws in production (e.g. detailed development error, compact `invariant()` failure). `!== 'development'` also enables the guarded code in tests; preserve existing dev-server mode gates.

## Performance and final bundle pass

- For runtime/memory changes, compare identical baseline/candidate workloads using the relevant [benchmark guide](benchmarks/AGENTS.md): client navigation, Start SSR, or memory. Add coverage for unmeasured mechanisms.
- **Last phase for every change affecting emitted client JavaScript**, including core/build transforms: complete the full [bundle-size-optimization skill](.agents/skills/bundle-size-optimization/SKILL.md) after correctness and performance validation. The full workflow is mandatory.
