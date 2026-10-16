# Vendored `@nkzw/eslint-plugin`

Upstream: <https://github.com/nkzw-tech/eslint-plugin>

Pinned revision: see `UPSTREAM.md`.

Oxlint rule IDs use the `nkzw` plugin prefix: `nkzw/<rule-name>` (for example
`nkzw/no-instanceof`). That prefix is the hint that these rules come from
Nakazawa Tech's ESLint plugin, not first-party workspace rules.

## Layout

```
nkzw/
  index.ts          # Oxlint plugin entry (`meta.name: "nkzw"`)
  rules/            # One file per rule (+ RuleTester tests)
  LICENSE           # Upstream MIT license
  UPSTREAM.md       # Pinned upstream git revision
  README.md         # This file (AGENTS.md symlinks here)
```

Keep rules generic. Do not add application-specific paths, names, or exceptions here —
those belong in the parent `tooling/oxlint-plugins/` workspace rules.

## Sync from upstream

1. **Choose a target revision** on `nkzw-tech/eslint-plugin` `main` (release tag or commit SHA).
2. **Diff vendored paths** against upstream:
   - `nkzw/rules/` ↔ upstream `rules/`
   - `nkzw/index.ts` ↔ upstream `index.js` (rule registry only; keep our Oxlint `defineRule` wrappers)
3. **Copy changed files** from upstream. Preserve Oxlint APIs (`defineRule`, ESTree).
   If upstream changed `LICENSE`, update `nkzw/LICENSE`.
4. **Run tests**:
   ```bash
   pnpm --filter @tooling/oxlint-plugins test
   ```
5. **Build plugins** and fix any new violations before enabling new rules in `.oxlintrc.json`:
   ```bash
   pnpm --filter @tooling/oxlint-plugins build
   pnpm lint-fix
   ```
6. **Record the revision** in `UPSTREAM.md` (commit SHA + date).
7. **Commit** with a message that names the upstream SHA, for example:
   `chore(oxlint-plugins): sync nkzw from nkzw-tech/eslint-plugin@<sha>`.

### Quick file copy (example)

```bash
UPSTREAM_SHA=main   # or a specific commit
tmpdir=$(mktemp -d)
git clone --depth 1 https://github.com/nkzw-tech/eslint-plugin.git "$tmpdir/eslint-plugin"
# Compare before overwriting:
diff -ru tooling/oxlint-plugins/nkzw/rules "$tmpdir/eslint-plugin/rules"
# Then copy selectively, adapt to defineRule, run tests.
rm -rf "$tmpdir"
```

Upstream also ships `ensure-relay-types`; we do not vendor it because this app
does not use Relay.

## Local conventions

- Use Oxlint's ESTree API; do not add another production parser.
- Add or update RuleTester coverage when rule semantics change.
- `@oxlint/plugins` version is managed at the monorepo catalog level, not in this folder.
