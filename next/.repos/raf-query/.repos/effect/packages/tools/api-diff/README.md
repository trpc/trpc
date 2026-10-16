# API Diff

`@effect/api-diff` compares the consumer-visible TypeScript declarations emitted
by two repository revisions. Its JSON output is canonical; the Markdown report
is intended for migration review and does not make semantic-version
compatibility claims.

Run a complete comparison from the repository root:

```sh
pnpm api-diff \
  --base-ref v3 \
  --head-ref origin/main \
  --output tmp/api-diff/run
```

Both refs are required and are resolved to commit SHAs before work starts. The
tool builds detached disposable worktrees with each branch's native build,
discovers every public package entrypoint independently, extracts both snapshots
with one pinned TypeScript compiler API, and caches successful snapshots by
commit and compiler.

After updating the extractor, regenerate both snapshots with the same extractor
before comparing them. Old snapshots may have lost information that the current
extractor preserves; comparing snapshots from different extractor generations is
not supported.

The command writes:

- `base.snapshot.json`
- `head.snapshot.json`
- `diff.json`
- `report.md`

Generate the agent-facing v3-to-v4 migration reference from a fresh diff and
the YAML files in `migration/annotations`:

```sh
pnpm api-diff --write-doc migration/v3-to-v4.md
```

The document command defaults to refs `v3` and `main`, records their resolved
SHAs, preserves the existing import map sections, and replaces the API
reference in place. It does not write `diff.json` unless `--output` is also
provided.

An API annotation can set `include: true` to retain migration guidance even
when the declaration comparison does not classify that API as changed.

List missing annotations, grouped by v3 module, and exit non-zero when any are
missing:

```sh
pnpm api-diff --check
```

Unmatched APIs are reported as removals from the base and additions in the
head. Likely replacements are reported separately for review, including
cross-module moves and the paired type/value facets of class-style APIs.
