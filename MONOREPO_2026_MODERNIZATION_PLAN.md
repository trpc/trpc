# Monorepo 2026 Modernization Plan

## Context

This repository is already in good shape (Turbo, pnpm workspace, modern TypeScript, package-level build outputs).  
The modernization focus is therefore on **reliability, determinism, cross-platform ergonomics, and CI hardening**.

## Goals

1. Make CI installs and test execution deterministic.
2. Improve Turbo cache correctness at the root.
3. Remove fragile shell pipelines from critical scripts/workflows.
4. Ensure upgrade tooling behaves correctly across npm/pnpm/yarn/bun.
5. Keep local contributor docs aligned with current workflows.

## Execution Plan (Detailed)

### Phase 1 - Root build orchestration and scripts

#### 1.1 Turbo cache dependency correctness
- **Problem**: Root `turbo.json` references `.eslintrc.config.js`, but the repo uses `eslint.config.js`.
- **Change**: Replace stale file reference with `eslint.config.js`.
- **Why**: Prevent stale caches when lint configuration changes.
- **Validation**:
  - `pnpm build` completes.
  - Cache invalidates on eslint config edits.

#### 1.2 Workspace script modernization
- **Problems**:
  - `clean` uses `find | xargs rm -rf` (less portable, brittle with path edge cases).
  - `typecheck-packages` bypasses Turbo task orchestration and remote cache.
  - `lint-prune` uses chained `grep` filters.
- **Changes**:
  - Introduce `scripts/clean.ts` (cross-platform recursive cleanup with `fast-glob` + `fs.rm`).
  - Switch `typecheck-packages` to Turbo task execution.
  - Replace `grep` chain with `rg` for prune filtering.
- **Validation**:
  - `pnpm clean` runs successfully.
  - `pnpm typecheck-packages` uses Turbo.
  - `pnpm lint-prune` behavior remains equivalent.

---

### Phase 2 - CI hardening

#### 2.1 Deterministic setup
- **Problems**:
  - Composite setup action manually configures pnpm store cache.
  - Install command does not enforce frozen lockfile.
- **Changes**:
  - Use `actions/setup-node` native `cache: 'pnpm'`.
  - Keep `pnpm/action-setup`, but disable implicit install.
  - Run `pnpm install --frozen-lockfile`.
- **Why**:
  - Simpler and more maintainable caching.
  - Ensures lockfile drift is caught immediately.
- **Validation**:
  - CI setup action still installs dependencies.
  - No behavior regressions in workflow jobs.

#### 2.2 Test/watch and script robustness in workflows
- **Problems**:
  - Unit test job does not explicitly disable watch mode.
  - E2E workflows use `cat | grep` checks for Playwright dependency detection.
- **Changes**:
  - Add `--watch false` to root Vitest CI command.
  - Replace shell text parsing with Node-based `package.json` checks.
- **Validation**:
  - Unit tests run once in CI mode.
  - Playwright install still runs only where needed.

---

### Phase 3 - Upgrade CLI package manager correctness

#### 3.1 Command mapping correctness across package managers
- **Problem**: Upgrade CLI currently uses generic install/uninstall verbs that are incorrect for bun and non-idiomatic for pnpm.
- **Change**: Use explicit command mapping:
  - npm: `install` / `uninstall`
  - pnpm: `add` / `remove`
  - yarn: `add` / `remove`
  - bun: `add` / `remove`
- **Validation**:
  - Add regression tests covering command mapping and fallback behavior.
  - Run targeted Vitest file.

---

### Phase 4 - Docs alignment

#### 4.1 Contributor test guidance update
- **Problem**: Contributing guide emphasizes watch usage but lacks one-shot command examples.
- **Change**: Add explicit non-watch test commands for CI-like local runs.
- **Validation**:
  - Docs include both watch and non-watch examples.

## Acceptance Criteria

- [ ] Plan file exists with actionable phases and validation steps.
- [ ] Root scripts and Turbo config are modernized.
- [ ] CI setup/workflow changes are merged and syntactically valid.
- [ ] Upgrade CLI package manager behavior is fixed with tests.
- [ ] Contributor docs updated.
- [ ] Focused validation commands pass locally.

## Rollback Strategy

If any CI behavior regresses:
1. Revert `.github/setup/action.yml` and workflow command changes first.
2. Keep script/tooling changes independent for easier bisect.
3. Re-run targeted test and typecheck jobs before re-applying CI adjustments.
