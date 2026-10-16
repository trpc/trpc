# Vendored Anti-Slop

Upstream: <https://github.com/dmmulroy/anti-slop>

Pinned revision: see `UPSTREAM.md`.

Oxlint rule IDs use the upstream plugin prefix: `anti-slop/<rule-name>` (for example
`anti-slop/no-chained-type-assertions`).

## Layout

```
anti-slop/
  index.ts          # Oxlint plugin entry (`meta.name: "anti-slop"`)
  rules/            # One file per rule (+ RuleTester tests)
  shared/           # Shared helpers (`dictionary-types`, etc.)
  effect/           # Opt-in `anti-slop-effect` plugin (index.ts, rules/, shared/)
  LICENSE           # Upstream MIT license
  UPSTREAM.md       # Pinned upstream git revision
  README.md         # This file (AGENTS.md symlinks here)
```

Keep rules generic. Do not add application-specific paths, names, or exceptions here —
those belong in the parent `tooling/oxlint-plugins/` workspace rules.

## Sync from upstream

1. **Choose a target revision** on `dmmulroy/anti-slop` `main` (release tag or commit SHA).
2. **Diff vendored paths** against upstream:
   - `anti-slop/rules/` ↔ upstream `src/rules/`
   - `anti-slop/shared/` ↔ upstream `src/shared/`
   - `anti-slop/index.ts` ↔ upstream `src/index.ts` (rule registry only; keep our build path)
3. **Copy changed files** from upstream. Preserve our import paths (`../shared/…` in rules).
   If upstream changed `LICENSE`, update `anti-slop/LICENSE`.
4. **Run upstream tests** adapted to this repo:
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
   `chore(oxlint-plugins): sync anti-slop from dmmulroy/anti-slop@<sha>`.

### Quick file copy (example)

```bash
UPSTREAM_SHA=main   # or a specific commit
tmpdir=$(mktemp -d)
git clone --depth 1 https://github.com/dmmulroy/anti-slop.git "$tmpdir/anti-slop"
# Compare before overwriting:
diff -ru tooling/oxlint-plugins/anti-slop/rules "$tmpdir/anti-slop/src/rules"
diff -ru tooling/oxlint-plugins/anti-slop/shared "$tmpdir/anti-slop/src/shared"
# Then copy selectively, fix imports, run tests.
rm -rf "$tmpdir"
```

Upstream's Effect-specific rules (`src/effect/`) are vendored in `effect/` as a separate
`anti-slop-effect` plugin (`effect/index.ts`, rule IDs `anti-slop-effect/<rule-name>`). They
are opt-in per workspace in `.oxlintrc.json`. Diff `anti-slop/effect/` ↔ upstream
`src/effect/` when syncing.

## Local conventions

- Use Oxlint's ESTree API; do not add another production parser.
- Add or update RuleTester coverage when rule semantics change.
- `@oxlint/plugins` version is managed at the monorepo catalog level, not in this folder.
