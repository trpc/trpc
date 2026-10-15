# Keep `vendor-src`; workspace-root packages are `dependencies` (human)

- Alex, 2026-10-09 (Q22.3): "yes on the workspace root but can be a deep [dep] as all things on the root should be deps not dev deps". `vendor-src` stays in `next/package.json`, and everything in that file goes in `dependencies`.
- Why: the root is private and never published, so the dev/prod split means nothing there. Packages under `packages/` keep the normal split, because consumers see it.
- Lives in: `next/package.json`.
