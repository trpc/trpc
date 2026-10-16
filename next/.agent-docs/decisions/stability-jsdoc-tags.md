# Stability is a JSDoc tag on every public export, with no name prefixes (agent)

- Answers Q21.1 (proposal 21): yes to JSDoc tags and no `unstable_`/`experimental_` prefixes. Every export reachable from a published entry point carries `@since <version>` and `@stability experimental | stable | internal`, plus an `@example`; the `trpcdev/jsdoc` lint rule enforces it ([`acronym-casing.md`](./acronym-casing.md), Q21.4).
- (agent) No separate experimental entry points: while everything is `experimental` (pre-beta), they would hold the whole API. `trpcdev/internal` and `trpcdev/internal/testing` are the no-guarantee entry points ([`entry-points.md`](./entry-points.md), [`testing-helpers-internal.md`](./testing-helpers-internal.md)).
- Why: a prefix forces a rename (a breaking change) when an API stabilizes, which is what v11's `unstable_httpBatchStreamLink` did; a tag changes nothing at call sites and shows in editor hovers.
- Lost: seeing stability at the import site without hovering.
- Lives in: `tooling/oxlint-plugin/jsdoc.ts`, `tooling/oxlint-plugin/public-exports.ts`, `vite.config.ts` (`trpcdev/jsdoc` override).
