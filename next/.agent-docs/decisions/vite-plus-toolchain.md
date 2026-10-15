# Vite+ is the toolchain (human)

- Alex, 2026-10-15 (decisions round 3, Q9 = proposal 22 Q22.1): "A".
- `vp` formats, lints (type-aware, with our oxlint plugin rules), tests and builds libraries (`vp pack`). `vp run` runs workspace tasks when `build` and `typecheck` need caching.
- (agent) Outside Vite+: the full typecheck stays `tsc --noEmit` per package plus declaration emit in `test/portability`; releases (versioning, changelogs, publishing), package-resolution checks (`publint`, arethetypeswrong) and bundle-size limits get their own tools when releases start.
- Why: one fast tool that already runs every gate; swapping to the individual tools later is mechanical.
- Lost: picking each tool's version independently.
- Lives in: `next/vite.config.ts`, `next/package.json`; packages' `build` scripts are not wired to `vp pack` yet.
