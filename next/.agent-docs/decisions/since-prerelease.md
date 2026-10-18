# `@since` is the `@trpc12/*` version an API first shipped in (human)

- Human, 2026-10-09 (Q21.2): "to be clear we'll be some sort of prerelease of 12 not 12.0.0".
- Human, 2026-10-16: "all the @since things should probably be since 0.0.1 too until we've changed". Replaces `12.0.0-alpha.0`: the preview ships as `@trpc12/*` at `0.0.x` ([`npm-names.md`](./npm-names.md)), so `@since` names a version users can install.
- (agent) The decision round's "B" on the first version ([`npm-names.md`](./npm-names.md)) makes the first preview release `0.1.0`, so every export today is `@since 0.1.0`; `0.0.1` is never published.
- (agent) An export added after a preview release carries the version of its own package it first ships in: each package has its own version ([`versioning.md`](./versioning.md)).
- (agent) At the rename to `trpc` and `@trpc/*`, every `@since 0.x` becomes `12.0.0`: no `trpc` release had those APIs before.
- Why: Q21.2 still holds (no claim of a stable 12.0.0 before it exists), and `12.0.0-alpha.0` is a version the preview never publishes.
- Lost: a `@since` that already reads as v12; per-API history across the rename, since every preview version becomes `12.0.0`.
- Lives in: the `@since` tags in `packages/*/src`; `tooling/oxlint-plugin/jsdoc.ts` (the `trpc/jsdoc` rule requires the tag, not a value); `packages/upgrade/src/bin.ts` (`--version`).
