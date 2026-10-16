# Oxc editor LSP bypasses `vp`

- Oxc VS Code prefers `vite-plus`’s `vp fmt|lint --lsp`. That crashes when the extension’s `node` is older than 22 (`styleText` missing) — Cursor’s PATH can still be Node 20.
- Workspace pins `oxc.path.oxfmt` / `oxc.path.oxlint` to the package bins and `oxc.fmt.configPath` / `oxc.configPath` to `.oxfmtrc.json` / `.oxlintrc.json`.
- `oxlint` is a direct devDependency so the bin path stays stable (not only nested under vite-plus).
