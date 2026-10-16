# Docs build renders each page once (agent)

- `docsContent` keeps a `rendered` Map of Twoslash results. Vite recreates plugins per environment during build unless `sharedDuringBuild: true`, so client and SSR each had their own Map.
- `transform` also did `rendered.delete(file)` before every render, which wiped the shared entry when SSR ran after client. Delete only when `this.environment.mode === "dev"` (HMR / snippet edits); `hotUpdate` still clears on file change.
- Before: 39 pages × 3 renders ≈ 114 Twoslash runs (~63s local). After: 39 renders (~half the build time). Lost: leaving the delete always on (forces a re-render per environment).
