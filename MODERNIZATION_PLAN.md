# tRPC Monorepo Modernization Plan (2026)

> Reviewed by Ahmed Elsakaan. This document catalogues every improvement recommended
> to bring the tRPC monorepo tooling into 2026. Items are grouped by priority
> and include exact file paths, before/after snippets, and rationale so any
> engineer (or agent) can execute them independently.

---

## Table of Contents

1. [Critical / High Impact](#1-critical--high-impact)
2. [Medium Impact](#2-medium-impact)
3. [Low Impact / Polish](#3-low-impact--polish)
4. [Out of Scope / Future](#4-out-of-scope--future)

---

## 1. Critical / High Impact

### 1.1 Fix `.tool-versions` — stale runtime versions

**File:** `.tool-versions`

The file still declares Node 20.10.0 and pnpm 8.15.5, while the project
actually requires Node 22 (`engines` in `package.json`) and pnpm 9.12.2+
(`packageManager` field). Any developer using `asdf` or `mise` will get the
wrong runtime.

**Before:**

```
nodejs 20.10.0
pnpm 8.15.5
```

**After:**

```
nodejs 22.18.0
pnpm 9.12.2
```

### 1.2 Fix `turbo.json` global dependency typo

**File:** `turbo.json`

`globalDependencies` references `.eslintrc.config.js` which does not exist.
The actual ESLint flat config file is `eslint.config.js`.

**Before:**

```json
"globalDependencies": [".eslintrc.config.js", ...]
```

**After:**

```json
"globalDependencies": ["eslint.config.js", ...]
```

### 1.3 Update tsdown build targets

**Files:** All `packages/*/tsdown.config.ts` (5 files: server, client,
react-query, next, tanstack-react-query)

Build targets are `node18` + `es2017`, but the project's own
`tsconfig.build.json` targets `es2022`, the `engines` field requires
Node >=22, and Node 18 is EOL since April 2025.

**Before:**

```ts
target: ['node18', 'es2017'],
```

**After:**

```ts
target: ['node22', 'es2022'],
```

### 1.4 Replace `ts-prune` with `knip`

**Files:** `package.json` (root), `.ts-prunerc`, `lint.yml`

`ts-prune` has been unmaintained since 2023 and is no longer reliable for
modern TypeScript. [`knip`](https://knip.dev) is the community standard
for detecting unused exports, files, and dependencies in 2026.

**Steps:**

1. Remove `ts-prune` from root `devDependencies`
2. Delete `.ts-prunerc`
3. Install `knip` as a devDependency
4. Create a minimal `knip.config.ts` at the root
5. Replace the `lint-prune` script with `knip --no-exit-code`
6. Update `.github/workflows/lint.yml` to call the new script

### 1.5 Remove obsolete `.kodiak.toml`

**File:** `.kodiak.toml`

Kodiak Bot was acqui-hired and the service was sunset in 2024. GitHub now
ships native auto-merge, merge queue, and Dependabot auto-approve rules.
This file is dead config.

**Action:** Delete `.kodiak.toml`.

### 1.6 Fix deprecated `.npmrc` settings

**File:** `.npmrc`

- `prefer-workspace-packages=true` — deprecated in pnpm 9. Workspace protocol
  (`workspace:*`) is the supported mechanism.
- `link-workspace-packages=true` — also deprecated in pnpm 9+. The workspace
  protocol handles this.

**Before:**

```ini
prefer-workspace-packages=true
link-workspace-packages=true
```

**After:** Remove both lines.

### 1.7 Drop Node 18 from legacy CI matrix

**File:** `.github/workflows/main.yml` → `e2e-legacy-node` job

The matrix tests against Node `18.x` and `20.x`. Node 18 reached EOL in
April 2025. It should be replaced with Node `22.x`.

**Before:**

```yaml
node-start: ['18.x', '20.x']
```

**After:**

```yaml
node-start: ['20.x', '22.x']
```

### 1.8 Modernize GitHub Actions setup composite action

**File:** `.github/setup/action.yml`

The `setup-node` step hardcodes `node-version: 22.x`. It should read from
`.nvmrc` so there's a single source of truth for the Node version.

**Before:**

```yaml
- uses: actions/setup-node@v6
  with:
    node-version: 22.x
```

**After:**

```yaml
- uses: actions/setup-node@v6
  with:
    node-version-file: '.nvmrc'
```

---

## 2. Medium Impact

### 2.1 Upgrade pnpm to v10

**Files:** `package.json`, `.tool-versions`, `.nvmrc` (if any pnpm ref)

pnpm 10 shipped stable in early 2025 with performance improvements, better
workspace support, and reduced `node_modules` size. The `packageManager` field
and `engines.pnpm` should both point to pnpm 10.

**Steps:**

1. Run `corepack prepare pnpm@latest --activate` (or update `packageManager`
   field to `pnpm@10.x.x`)
2. Update `engines.pnpm` to `^10.0.0`
3. Update `.tool-versions` to match
4. Run `pnpm install` to regenerate lockfile
5. Verify CI green

### 2.2 Update `eslint-plugin-react-hooks` to stable

**File:** `package.json` (root)

Currently pinned to `6.0.0-rc.1`. The stable 6.x series has been released.
Update to `^6.0.0`.

### 2.3 Clean up root `package.json` dependencies

**File:** `package.json` (root)

Several root-level dependencies are unused or redundant:

| Dependency | Issue |
|---|---|
| `fast-glob` | Not used in any root script — only needed inside packages |
| `concurrently` | `npm-run-all2` is already used everywhere instead |
| `hash-sum` | Only used by `@trpc/server` (already in its devDeps) |
| `superjson` | Only used by packages/examples (already in their deps) |
| `event-source-polyfill` + `@types/event-source-polyfill` | Native `EventSource` available since Node 22 |
| `isomorphic-fetch` (in `@trpc/client`) | `fetch` is built into all supported runtimes |

Remove these from root; verify nothing breaks.

### 2.4 Simplify Vitest workspace config

**File:** `vitest.workspace.json`

Currently `["packages/*"]` which is very broad. Consider explicitly
listing only the test-bearing packages, or using a glob that excludes
`packages/upgrade` (which has no tests).

---

## 3. Low Impact / Polish

### 3.1 Add `catalog:` protocol for shared dependency versions

pnpm 9+ supports `catalog:` in `pnpm-workspace.yaml` to define shared
dependency versions across packages. This could replace the custom
`scripts/version.ts` pin script for external dependencies like
`typescript`, `eslint`, `@types/node`, etc.

### 3.2 Consider replacing Lerna with Changesets for publishing

Lerna is heavy, and most modern monorepos have migrated to
[Changesets](https://github.com/changesets/changesets) for versioning and
publishing. This is a larger migration but would:

- Remove the `lerna` dependency (~150+ transitive deps)
- Provide better changelog generation
- Integrate natively with pnpm workspaces

### 3.3 Add `@biomejs/biome` as unwanted extension in `.vscode/extensions.json`

Already present — no action needed. Just noting the team has explicitly
opted out of Biome.

### 3.4 Update Renovate config to use new preset names

**File:** `.github/renovate.json`

The `config:base` preset was renamed to `config:recommended` in Renovate 37.

**Before:**

```json
"extends": ["config:base", ":preserveSemverRanges"]
```

**After:**

```json
"extends": ["config:recommended", ":preserveSemverRanges"]
```

### 3.5 Clean up the Deno setup action version

**File:** `.github/workflows/main.yml` → `e2e-deno` job

`denoland/setup-deno@v1` should be updated to `denoland/setup-deno@v2` for
the latest caching and version resolution.

---

## 4. Out of Scope / Future

These are larger architectural changes that should be tracked separately:

- **Migrate from Docusaurus to a modern docs framework** (Starlight, Fumadocs, etc.)
- **Drop CJS builds** — once the ecosystem is ESM-only ready
- **Add Oxlint** as a fast first-pass linter alongside ESLint
- **Migrate to Biome** for formatting (if the team ever reconsiders)
- **Introduce bundlewatch / size-limit** for package size regression tracking

---

## Execution Order

1. Items 1.1–1.8 (critical, zero risk of breakage)
2. Items 2.1–2.4 (medium, require lockfile regen / CI verification)
3. Items 3.1–3.5 (polish, can be done incrementally)

All changes should be committed atomically per section and CI should be
verified green between sections.
