# Upstream pin

Repository: <https://github.com/dmmulroy/anti-slop>

Revision: `6d538555cb151d4121ed51a27db81890eacf8ae9`

Synced: 2026-03-28 (initial vendored import into `tooling/oxlint-plugins/anti-slop/`)

### Partial adoption: Effect rules

`effect/` was copied from upstream `src/effect/` at
`c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` on 2026-10-02. The generic rules
were not reconciled against that revision, so the baseline above stays at
`6d538555`. The Effect plugin was a new path, with no local copy to merge.

Local deviations: tests wire `RuleTester.describe` / `RuleTester.it` to Vitest,
and files are reformatted with oxfmt. The rules are enabled only for code that
uses Effect (an override in `.oxlintrc.json`).

When syncing, replace the revision above and note the date. Compare `src/rules/` and
`src/shared/` from that commit against this directory.

## License

Upstream is MIT-licensed. The full text lives in [`LICENSE`](./LICENSE) in this folder.
When syncing, if upstream changes `LICENSE`, copy the updated file here.
