# Experimental APIs have an `unstable_` prefix and a stability tag; promoting renames with a deprecated alias (human)

- Human, 2026-10-16 (Q21.1, decision round): "B + keep stability tag, when promoting we should rename and do a deprecated alias".
- Every export reachable from a published entry point carries `@since <version>` and `@stability experimental | stable | internal`, plus an `@example`; the `trpcdev/jsdoc` lint rule enforces it ([`acronym-casing.md`](./acronym-casing.md), Q21.4).
- An experimental export's name starts with `unstable_` (`unstable_durableLink`). Promoting it to stable adds the unprefixed name and keeps `unstable_*` as an alias tagged `@deprecated Use <name>`, removed in the next major. The codemod rewrites the alias.
- (agent) No separate experimental entry points. `trpcdev/internal` and `trpcdev/internal/testing` are the no-guarantee entry points ([`entry-points.md`](./entry-points.md), [`testing-helpers-internal.md`](./testing-helpers-internal.md)).
- Why: stability is visible at the import site; the deprecated alias keeps promotion non-breaking, which v11's `unstable_httpBatchStreamLink` rename wasn't.
- Lost: names that never change; promotion leaves an alias behind until the next major.
- Lives in: `tooling/oxlint-plugin/jsdoc.ts`, `tooling/oxlint-plugin/public-exports.ts`, `vite.config.ts` (`trpcdev/jsdoc` override).
