# Knip (human asked)

- `pnpm knip` runs in CI. The config is `knip.jsonc`.
- Every issue type is `error`, including `nsExports`, `nsTypes`, and `cycles` (off or a warning by default). An export used only in its own file is reported. Private workspaces report unused exports of entry files too.
- `packages/core`, `packages/react`, and `.experimental/tanstack-query/package` do not: their entry file is the public API. `@examples/ui` does not either: the shadcn kit's `package.json` exports are that surface.
- The `knip --strict` flag is not the script. It turns on production mode, which skips tests and devDependencies, so it would miss unused code this run reports and instead flag build scripts and `vp`.
- Named exceptions live in `knip.jsonc`: `.repos/`, the `vp lint` / `vp fmt` packages, the coverage provider, Tailwind resolved from the app root, the docs' sample apps (`www/samples/*`: every file an entry, since markdown `sample` fences show them; www's `@samples/*` devDependencies, which the build reads from disk; `sample:` imports), browser condition files, bundle-size fixtures, the oxlint plugins loaded by path, and `examples/react-router`'s generated `./+types/*` imports (`unresolved` ignored; Knip does not see `react-router typegen` / `rootDirs`).
