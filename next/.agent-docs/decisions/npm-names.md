# Preview packages are all `@trpc12/*`; 12.0.0 ships as `trpc` and `@trpc/*` (human)

- Human, 2026-10-16: "i don't like the trpcdev and @trpcdev prefixes as i wanna start pushing all of the changes to a 0.0.0 range of fresh packages (@trpcdev/react already exist)". Overrides the brief's `@trpcdev` scope and its unscoped `trpcdev` package ([`brief.md`](./brief.md)).
- Human, 2026-10-16: "once we hit 1.0.0 we should ACTUALLY deprecate all packages and launch them as trpc 12 (trpc package and @trpc/<scoped>)".
- Human, 2026-10-16: "can they all be scoped under @trpc12, including the package that's gonna be trpc?", then "cool". Every package is scoped:

  | Preview (`0.x`)                                          | At 12.0.0      |
  | -------------------------------------------------------- | -------------- |
  | `@trpc12/trpc`                                           | `trpc`         |
  | `@trpc12/<name>` (`nest`, `upgrade`, `tanstack-*-query`) | `@trpc/<name>` |

- Human, 2026-10-16: "whenever we do this change, make sure to prompt me about the final calls on the naming of all the packages that's gonna be called". The table's right column is a default, not a decision.
- (agent) The core is `@trpc12/trpc`, not `@trpc12/core`: `@trpc/core` already exists on npm, and the core becomes `trpc`, not `@trpc/core`.
- (agent) Only npm package names, and keys namespaced by them (Effect service keys such as `'@trpc12/trpc/Response'`, `Symbol.for('@trpc12/trpc/TaggedError')`), carry `@trpc12`. Names that are never published say `trpc`: the oxlint plugin (`trpc/jsdoc`, `trpc/acronym-case`), span names (`trpc.upgradeFiles`), temp dirs. The codemod's bin is `trpc12-upgrade`. The core's folder is `packages/trpc`.
- (agent) The 12.0.0 rename is two ordered replaces: `@trpc12/trpc` (followed by `/`, `'`, `"` or a backtick) → `trpc`, then `@trpc12/` → `@trpc/`, then `trpc12-upgrade` → the bin name the human picks. No package after the scope starts with `trpc`, so the first replace can't catch another package.
- (agent) No preview `1.0.0` is published: "1.0.0" is the point where the preview is ready, and what ships then is `trpc@12.0.0` and `@trpc/*@12.0.0`, followed by `npm deprecate` on every `@trpc12/*` version pointing at its new name. Publishing both would give two stable lines.
- `@since` follows the preview's `0.x` versions and becomes `12.0.0` at the rename ([`since-prerelease.md`](./since-prerelease.md)).
- Human, 2026-10-16: "i like the @trpc12 scoping as then we can still follow semver pre 12.0.0".
- (agent) The preview packages share one version and release together.
- Human, 2026-10-16 (decision round, when to leave `0.0.x`): "B". The first release is `0.1.0`, so semver holds from the start: a minor is a breaking change, a patch a fix or an addition. Supersedes the "0.0.0 range" above; `@since` moves with it ([`since-prerelease.md`](./since-prerelease.md)). Every package's `version` is `0.1.0`. Lost: `0.0.x`'s exact pinning, which said "everything breaks" without a word of docs.
- Why: the preview follows semver on its own version line, which `12.0.0-alpha.N` prereleases can't (a prerelease range promises nothing between alphas). `@trpcdev` is taken by 2021 prototypes (`@trpcdev/client`, `@trpcdev/server`, `@trpcdev/react` at `1.0.0-alpha.15`). One scope is one npm org to own, publish from and deprecate, and the names say "the v12 preview".
- Lost: unscoped `trpc12` with `@trpc12/*` integrations, whose rename to `trpc` and `@trpc/*` would be one replace; `trpc@12.0.0-alpha.N` prereleases under the final names, which need no rename or deprecation but mix v12 alphas into the v11 packages' version lists.
- Later (human): before the rename to `trpc` and `@trpc/*`, ask the human for the final name of every package and the codemod's bin, one at a time, starting from the table above. Don't rename without those answers. Human, 2026-10-16: "that's way in the future, we got a lot of work before that", so decision rounds leave it out until the rename is near.
- The unscoped `trpc` package on npm (`0.11.3`, from `vriad`) is needed for 12.0.0. Human, 2026-10-16: "been moved to @trpc scope" (`npm view trpc maintainers` still listed only `vriad` that day). The new `@trpc/*` names (`nest`, `tanstack-query` and the framework `tanstack-*-query` packages other than `react`) are free; `@trpc/server`, `@trpc/client`, `@trpc/upgrade` and `@trpc/tanstack-react-query` are the v11 packages.
- Human, 2026-10-16: "i've created it", the `@trpc12` npm org. Every package has `"publishConfig": { "access": "public" }` (scoped packages publish as restricted by default), checked by `tooling/pack/pack.test.ts`.
- Open: publishing. Each package still has `"private": true`, and there's no release workflow or npm token yet.
- (agent) The 2021 `@trpcdev/*` packages are already deprecated on npm ("replaced by @trpc/*-packages - see tRPC.io", 2022), so nothing is left to decide there.
- Lives in: `packages/*/package.json` (`name`, `bin`), `packages/trpc/` (the core), `packages/upgrade/src/transform.ts` (`TRPC12`, the `@trpc/*` → `@trpc12/*` module map), `tooling/oxlint-plugin/index.ts` (`meta.name`), `vite.config.ts`, `tooling/pack/pack.test.ts` (scope and access).
