# oxlint plugins

Two JS plugins, both registered in `../../vite.config.ts` (`lint.jsPlugins`) and run by `pnpm check`.

## `trpc/`

Entry `index.ts`. Rules, switched on in `vite.config.ts` (everywhere unless noted):

| Rule                           | Purpose                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acronym-case`                 | Acronyms cased as words: `TrpcError`, `maxUrlLength`                                                                                                  |
| `typed-objects`                | An object literal kept in a variable and passed on is typed (`: T` or `satisfies T`) or inlined, so excess properties are checked; off in `spikes/**` |
| `jsdoc`                        | `@since` and `@stability` on exports reachable from versioned entry points; `packages/*/src`, not tests or fixtures                                   |
| `no-mock`                      | No module mocks (`vi.mock`, `vi.hoisted`, …); `vi.fn`, `vi.spyOn` and `vi.stubGlobal` stay allowed                                                    |
| `no-custom-test-timeout`       | Tests keep Vitest's default timeouts                                                                                                                  |
| `no-overzealous-destructuring` | A destructured local is read at least three times; off in `spikes/**`                                                                                 |
| `infer-callback-params`        | Callbacks leave their parameters to inference from the call; `examples/**` only                                                                       |

## `anti-slop-effect`

`anti-slop/effect/` is a separate plugin, vendored from upstream. Its rules are on only for code built on Effect (`packages/*/src`, `tooling`, `test`, `examples/effect`). `anti-slop/AGENTS.md` covers what's adopted and how to sync upstream. Keep tRPC-specific rules in `trpc/`.

## Writing a rule

- Build it with `defineRule` and type nodes with `ESTree`, both from `@oxlint/plugins`; register it in `index.ts` (`eslintCompatPlugin`).
- Test it beside the rule with `RuleTester` from `oxlint/plugins-dev`, after `RuleTester.describe = describe; RuleTester.it = it;` (from `vite-plus/test`). See `no-mock.test.ts`.
- Run the tests with `pnpm vp test run tooling/oxlint-plugin`.

## Measuring a rule before enabling it

Count a rule's hits on the real code before switching it on. From `next/`:

- Put the temporary oxlint config in `next/`: its `ignorePatterns` resolve relative to the config file.
- Put any temporary JS plugin file in `tooling/oxlint-plugin/`, or `@oxlint/plugins` won't resolve.
- Run `tooling/oxlint-plugin/node_modules/.bin/oxlint -c <config> -f unix .` and count the lines. Type-aware runs (`--type-aware`) also need `tsgolint` on `PATH`, from `node_modules/.pnpm/node_modules/.bin`.

Fix every hit, then enable the rule at `error`. Never use `eslint-disable` comments; fix the code, or scope the rule with an override and a comment saying why.
