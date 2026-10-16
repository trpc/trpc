# Vite+ is the toolchain (human)

- Alex, 2026-10-15 (decisions round 3, Q9 = proposal 22 Q22.1): "A".
- `vp` formats, lints (type-aware, with our oxlint plugin rules), tests and builds libraries (`vp pack`). `vp run` runs workspace tasks when `build` and `typecheck` need caching.
- (agent) Outside Vite+: the full typecheck stays `tsc --noEmit` per package plus declaration emit in `test/portability`; releases (versioning, changelogs, publishing), package-resolution checks (`publint`, arethetypeswrong) and bundle-size limits get their own tools when releases start.
- Why: one fast tool that already runs every gate; swapping to the individual tools later is mechanical.
- Lost: picking each tool's version independently.
- (agent) Built: each package's `build` runs `tooling/pack/pack.ts`. It calls `vp pack --no-config --dts --unbundle --platform neutral` over every `exports` entry, writing ESM and declarations (fast, from `isolatedDeclarations`) to `dist/`. Workspace `exports` stay on `src/`; `publishConfig.exports` points at `dist/`, and the script fails if the two drift. `tooling/pack/pack.test.ts` builds every package and checks each published entry exports what its source does.
- Lives in: `next/vite.config.ts`, `next/package.json`, `next/tooling/pack/`, `packages/*/package.json` (`build`, `files`, `publishConfig`).
