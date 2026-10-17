# anti-slop (vendored)

Oxlint rules copied from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) (MIT, see [`LICENSE`](./LICENSE)). We found them through [raf-query](https://github.com/KATT/raf-query), which vendors the same rules under `tooling/oxlint-plugins/anti-slop/` (readable at `.repos/raf-query/tooling/oxlint-plugins/anti-slop/`).

## Pin

- Upstream: `dmmulroy/anti-slop@13909c9e07590f5a85d93c62712259fe14a883f7` (`main`, 2026-10-13). `src/effect/` last changed in `e6676e8`; raf-query's copy is the same code.
- Synced: 2026-10-17.

## What's here

`effect/` mirrors upstream `src/effect/`. Its `index.ts` registers the opt-in `anti-slop-effect` plugin, so rule IDs match upstream (`anti-slop-effect/<rule>`).

| Rule                            | Upstream file                                       |
| ------------------------------- | --------------------------------------------------- |
| `no-manual-tag-comparison`      | `src/effect/rules/no-manual-tag-comparison.ts`      |
| `no-manual-tagged-construction` | `src/effect/rules/no-manual-tagged-construction.ts` |
| `prefer-effect-match`           | `src/effect/rules/prefer-effect-match.ts`           |

`effect/shared/tagged-values.ts` is copied whole, helpers for rules we haven't adopted included, so it diffs cleanly.

Not adopted: upstream's generic `src/rules/` and the Effect rules `no-manual-effect-error-tag` and `no-service-constructor-imports`.

The plugin is registered in `vite.config.ts` (`lint.jsPlugins`), and the rules are switched on by an override for code built on Effect (`packages/*/src`, `tooling`, `test`, `examples/effect`), not for `spikes`.

## Local changes

Keep these few, so a sync stays a diff:

- `effect/index.ts` registers only the adopted rules.
- Each test file sets `RuleTester.describe` / `RuleTester.it` from `vite-plus/test`.
- `pnpm fix` reformats everything (single quotes, 2 spaces).

Rules stay generic. Put tRPC-specific rules in `../` (the `trpc/` plugin), not here.

## Update

1. Clone upstream and check what changed since the pin:

   ```bash
   git clone https://github.com/dmmulroy/anti-slop.git /tmp/anti-slop
   git -C /tmp/anti-slop log --oneline 13909c9e07590f5a85d93c62712259fe14a883f7..HEAD -- src/effect LICENSE
   ```

2. Copy the adopted rules, their tests and `src/effect/shared/` over the files here. Copy `LICENSE` if it changed. Don't overwrite `effect/index.ts`; add any new or renamed adopted rule to it by hand.
3. Re-add the `RuleTester.describe` / `RuleTester.it` lines to each test, then run `pnpm fix`. `git diff` now shows upstream's real changes only.
4. Run the tests: `pnpm vp test run tooling/oxlint-plugin`.
5. Run `pnpm check` and fix new hits in code (not with `eslint-disable`). To adopt another rule, copy it the same way, register it in `effect/index.ts`, enable it in the `vite.config.ts` override, and fix every hit first.
6. Update the pin above (SHA, date) and the "Not adopted" list.
7. Commit, for example: `chore(oxlint-plugin): sync anti-slop from dmmulroy/anti-slop@<sha>`.
