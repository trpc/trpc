# tRPC Monorepo 2026 Modernization Plan

**Author:** Ahmed Elsakaan  
**Date:** February 2026  
**Purpose:** Comprehensive plan to modernize the tRPC monorepo for 2026, with sufficient detail for another agent to execute.

---

## Executive Summary

The tRPC monorepo is already well-structured with pnpm workspaces, Turborepo, Vitest, and ESLint flat config. This plan identifies improvements across build targets, CI/CD, tooling, and configuration to align with 2026 best practices and Node.js LTS timelines.

---

## 1. Build Targets & Runtime Compatibility

### Current State
- **Engines:** `node: ^22.18.0`, `pnpm: ^9.12.2`
- **tsdown targets:** All packages use `['node18', 'es2017']`
- **tsconfig:** `lib: ["es2022"]`, `target: "es2022"`
- **CI e2e-legacy-node:** Tests Node 18.x and 20.x

### Issues
- Node 18 reached End-of-Life (EOL) in April 2025
- Build targets are inconsistent with declared engines (Node 22)
- Legacy Node matrix includes EOL Node 18

### Recommended Changes

| File | Change |
|------|--------|
| `packages/server/tsdown.config.ts` | `target: ['node20', 'es2022']` (or `node22` if tsdown supports it) |
| `packages/client/tsdown.config.ts` | Same |
| `packages/react-query/tsdown.config.ts` | Same |
| `packages/tanstack-react-query/tsdown.config.ts` | Same |
| `packages/next/tsdown.config.ts` | Same |
| `packages/server/tsconfig.json` | Update comment from node18 to node20 |
| `.github/workflows/main.yml` (e2e-legacy-node) | Replace `node-start: ['18.x', '20.x']` with `['20.x', '22.x']` |

**Rationale:** Node 20 is LTS until April 2026. Node 22 is Current LTS. Dropping Node 18 aligns with security and maintenance.

---

## 2. TypeScript & ECMAScript Targets

### Current State
- TypeScript: `^5.9.2`
- Root tsconfig: `lib: ["es2022", "dom", "dom.iterable"]`, `target: "es2022"`
- packages/server: `lib: ["es2023", "DOM", ...]`

### Recommended Changes
- Consider `lib: ["es2023", "dom", "dom.iterable"]` at root for Array.fromAsync, Object.groupBy, etc.
- Update `tsconfig.build.json` target to `es2022` (already correct) — no change needed.
- Ensure `module: "Preserve"` is intentional (Node 22+ native ESM).

---

## 3. Vitest Configuration

### Current State
- Vitest: `^3.1.2`
- Coverage provider: `@vitest/coverage-istanbul` (istanbul)
- Workspace: `vitest.workspace.json` with `["packages/*"]`

### Issues
- Istanbul coverage is deprecated in favor of V8 for Vitest 3
- Vitest 3 recommends `@vitest/coverage-v8` for better performance and accuracy

### Recommended Changes

| File | Change |
|------|--------|
| `package.json` | Replace `@vitest/coverage-istanbul` with `@vitest/coverage-v8` |
| `vitest.config.ts` | Change `provider: 'istanbul'` to `provider: 'v8'` |

**Note:** V8 coverage may produce slightly different output. Verify Codecov compatibility.

**Update (Feb 2026):** V8 coverage was attempted but caused a test timeout in `@trpc/upgrade` (hooks basic.tsx). Reverted to istanbul. Consider increasing test timeout for upgrade package if migrating to v8 in future.

---

## 4. Lint & Dead Code Detection

### Current State
- `lint-prune` script: `! ts-prune | grep -v "used in module" | grep -v rpc | grep -v observable | grep -v http | grep -v __fixtures__ | grep -v __generated__`
- ts-prune is unmaintained and slow

### Recommended Changes

**Option A (Minimal):** Keep ts-prune but fix the script. The `!` inverts exit code — ensure it fails when ts-prune finds unused exports (after grep filtering).

**Option B (Recommended):** Replace with [Knip](https://knip.dev/):
- Add `knip` as devDependency
- Create `knip.json` or `knip.jsonc` at root with config for monorepo
- Replace `lint-prune` with `knip` in package.json
- Update `.github/workflows/lint.yml` to run `pnpm knip` instead of `pnpm lint-prune`

Knip config example:
```json
{
  "$schema": "https://unpkg.com/knip@latest/schema.json",
  "entry": ["packages/*/src/index.ts", "packages/*/src/**/index.ts"],
  "project": ["packages/*/src/**/*.ts", "!**/*.test.ts"],
  "ignore": ["**/__fixtures__/**", "**/__generated__/**", "**/vendor/**"]
}
```

---

## 5. ESLint & React Hooks

### Current State
- `eslint-plugin-react-hooks`: `6.0.0-rc.1` (release candidate)
- ESLint 9 flat config in use
- `react-hooks/react-compiler`: `error` (good — React Compiler support)

### Recommended Changes
- Upgrade `eslint-plugin-react-hooks` to stable `^6.0.0` when available (check npm)
- If 6.0.0 is released, update; otherwise keep rc.1

---

## 6. GitHub Actions

### Current State
- `actions/checkout@v6`
- `actions/setup-node@v6`
- `pnpm/action-setup@v4`
- `actions/cache@v5`
- Node: `22.x` in setup

### Recommended Changes
- Pin actions to full SHAs for security (e.g., `actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11` for v6)
- Or use `@v6` — both are acceptable; SHA pins are more reproducible
- Ensure `e2e-legacy-node` uses Node 20 and 22 only (see §1)

---

## 7. Prettier Configuration

### Current State
- No `.prettierrc` or `prettier.config.js` at root
- Uses `@ianvs/prettier-plugin-sort-imports` and `prettier-plugin-tailwindcss` (inferred from package.json — verify they're in Prettier config)

### Recommended Changes
- Add explicit `prettier.config.js` or `prettier.config.mjs` if plugins are used, to ensure they're loaded:
```js
export default {
  plugins: ['@ianvs/prettier-plugin-sort-imports', 'prettier-plugin-tailwindcss'],
  // ... other options
};
```
- Check if Prettier 3.x picks these from package.json automatically — if so, no change needed.

---

## 8. Turbo Configuration

### Current State
- Turbo 2.5.4
- Uses `TURBO_TOKEN` and `TURBO_TEAM` for remote caching

### Recommended Changes
- Ensure `turbo.json` has `remoteOnly` or appropriate cache strategy for CI
- Consider adding `turbo run build --summarize` for build insights
- No urgent changes — Turbo 2 is current

---

## 9. Lerna & Publishing

### Current State
- Lerna 9 for versioning and publishing
- `pnpm lerna publish` for canary and releases

### Future Consideration (Not in Scope for This Plan)
- [Changesets](https://github.com/changesets/changesets) is popular in 2026 for versioning
- pnpm has `pnpm publish -r` for recursive publish
- Migration would require workflow changes — document as future improvement only

---

## 10. Dependency Updates

### Recommended Version Bumps (verify compatibility)
- `@vitest/coverage-v8`: Add, remove istanbul
- `eslint-plugin-react-hooks`: `^6.0.0` when stable
- All `^x.y.z` ranges are generally fine — run `pnpm update -r` periodically

---

## 11. Implementation Order

1. **Build targets** — Update tsdown configs (low risk)
2. **CI e2e-legacy-node** — Update Node matrix (medium risk, test thoroughly)
3. **Vitest coverage** — Switch to v8 (low risk, verify Codecov)
4. **lint-prune → Knip** — Optional, higher effort
5. **Prettier config** — Only if plugins not loading
6. **ESLint plugin** — When stable released

---

## 12. Verification Checklist

After each change:
- [ ] `pnpm install`
- [ ] `pnpm build`
- [ ] `pnpm test -- --watch false`
- [ ] `pnpm typecheck-packages`
- [ ] `pnpm typecheck-www`
- [ ] `pnpm lint`
- [ ] Run at least one e2e example: `pnpm turbo --filter ./examples/minimal build`

---

## 13. Files to Modify (Summary)

| Path | Action |
|------|--------|
| `packages/server/tsdown.config.ts` | target: node20 |
| `packages/client/tsdown.config.ts` | target: node20 |
| `packages/react-query/tsdown.config.ts` | target: node20 |
| `packages/tanstack-react-query/tsdown.config.ts` | target: node20 |
| `packages/next/tsdown.config.ts` | target: node20 |
| `packages/server/tsconfig.json` | comment: node20 |
| `.github/workflows/main.yml` | e2e-legacy-node: 20.x, 22.x |
| `package.json` | coverage-v8, remove istanbul |
| `vitest.config.ts` | provider: v8 |
| `knip.json` (optional) | Add if adopting Knip |
| `package.json` (optional) | lint-prune → knip |

---

## 14. Rollback Plan

All changes are in config files. Revert via git if issues arise. For Vitest coverage, keep `@vitest/coverage-istanbul` in package.json until v8 is verified with Codecov.
