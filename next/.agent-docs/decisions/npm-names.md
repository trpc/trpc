# Preview packages are all `@trpc12/*`; 12.0.0 ships as `trpc` and `@trpc/*` (human)

- Human, 2026-10-16: "i don't like the trpcdev and @trpcdev prefixes as i wanna start pushing all of the changes to a 0.0.0 range of fresh packages (@trpcdev/react already exist)". Overrides the brief's `@trpcdev` scope and its unscoped `trpcdev` package ([`brief.md`](./brief.md)).
- Human, 2026-10-16: "once we hit 1.0.0 we should ACTUALLY deprecate all packages and launch them as trpc 12 (trpc package and @trpc/<scoped>)".
- Human, 2026-10-16: "can they all be scoped under @trpc12, including the package that's gonna be trpc?", then "cool". Every package is scoped:

  | Preview (`0.0.x`)                                        | At 12.0.0      |
  | -------------------------------------------------------- | -------------- |
  | `@trpc12/trpc`                                           | `trpc`         |
  | `@trpc12/<name>` (`nest`, `upgrade`, `tanstack-*-query`) | `@trpc/<name>` |

- Human, 2026-10-16: "whenever we do this change, make sure to prompt me about the final calls on the naming of all the packages that's gonna be called". The table's right column is a default, not a decision.
- (agent) The core is `@trpc12/trpc`, not `@trpc12/core`: `@trpc/core` already exists on npm, and the core becomes `trpc`, not `@trpc/core`.
- (agent) Only npm package names, and keys namespaced by them (Effect service keys such as `'@trpc12/trpc/Response'`, `Symbol.for('@trpc12/trpc/TaggedError')`), carry `@trpc12`. Names that are never published say `trpc`: the oxlint plugin (`trpc/jsdoc`, `trpc/acronym-case`), span names (`trpc.upgradeFiles`), temp dirs. The codemod's bin is `trpc12-upgrade`. The core's folder is `packages/trpc`.
- (agent) The 12.0.0 rename is two ordered replaces: `@trpc12/trpc` (followed by `/`, `'`, `"` or a backtick) → `trpc`, then `@trpc12/` → `@trpc/`, then `trpc12-upgrade` → the bin name the human picks. No package after the scope starts with `trpc`, so the first replace can't catch another package.
- (agent) No preview `1.0.0` is published: "1.0.0" is the point where the preview is ready, and what ships then is `trpc@12.0.0` and `@trpc/*@12.0.0`, followed by `npm deprecate` on every `@trpc12/*` version pointing at its new name. Publishing both would give two stable lines.
- `@since` follows the preview's `0.0.x` versions and becomes `12.0.0` at the rename ([`since-prerelease.md`](./since-prerelease.md)).
- Human, 2026-10-16: "i like the @trpc12 scoping as then we can still follow semver pre 12.0.0".
- (agent) The preview packages share one version and release together: on `0.0.x`, `^0.0.3` matches only `0.0.3`, so every release is breaking.
- Open (human): when to move from `0.0.x` to `0.1.0`, after which a patch release can mean a fix, not a break.
- Why: the preview follows semver on its own version line, which `12.0.0-alpha.N` prereleases can't (a prerelease range promises nothing between alphas). `@trpcdev` is taken by 2021 prototypes (`@trpcdev/client`, `@trpcdev/server`, `@trpcdev/react` at `1.0.0-alpha.15`). One scope is one npm org to own, publish from and deprecate, and the names say "the v12 preview".
- Lost: unscoped `trpc12` with `@trpc12/*` integrations, whose rename to `trpc` and `@trpc/*` would be one replace; `trpc@12.0.0-alpha.N` prereleases under the final names, which need no rename or deprecation but mix v12 alphas into the v11 packages' version lists.
- Open (human): before the rename to `trpc` and `@trpc/*`, ask the human for the final name of every package and the codemod's bin, one at a time, starting from the table above. Don't rename without those answers.
- Open (human): the unscoped `trpc` package on npm is at `0.11.3` with one maintainer (`vriad`); it needs the tRPC maintainers added or a transfer before 12.0.0. The new `@trpc/*` names (`nest`, `tanstack-query` and the framework `tanstack-*-query` packages other than `react`) are free; `@trpc/server`, `@trpc/client`, `@trpc/upgrade` and `@trpc/tanstack-react-query` are the v11 packages.
- Open: the `@trpc12` npm org isn't created yet. Publishing also needs `"private": true` dropped and `"publishConfig": { "access": "public" }` on each package (scoped packages publish as restricted by default). Whether to deprecate the 2021 `@trpcdev/*` packages is the human's call.
- Lives in: `packages/*/package.json` (`name`, `bin`), `packages/trpc/` (the core), `packages/upgrade/src/transform.ts` (`TRPC12`, the `@trpc/*` → `@trpc12/*` module map), `tooling/oxlint-plugin/index.ts` (`meta.name`), `vite.config.ts`.
