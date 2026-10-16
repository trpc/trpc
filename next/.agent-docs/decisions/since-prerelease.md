# `@since` uses the v12 prerelease version (human)

- Human, 2026-10-09 (Q21.2): "to be clear we'll be some sort of prerelease of 12 not 12.0.0". `@since` carries the prerelease an API first shipped in; today that is `12.0.0-alpha.0`.
- Why: `@since 12.0.0` would claim a stable release that doesn't exist, and the real prerelease tells readers which one introduced an API.
- Open: the tag (`alpha`, `next`, …) once releases start.
- (agent) Lean on the tag: `alpha`, which every `@since` already uses (`12.0.0-alpha.0`); `next` stays the npm dist-tag name.
- Lives in: `tooling/oxlint-plugin/jsdoc.ts` (the `trpcdev/jsdoc` rule checks `@since`).
