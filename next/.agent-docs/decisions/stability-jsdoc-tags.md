# Experimental APIs have an `unstable_` prefix and a stability tag; promoting renames with a deprecated alias (human)

- Human, 2026-10-16 (Q21.1, decision round): "B + keep stability tag, when promoting we should rename and do a deprecated alias".
- Every export reachable from a published entry point carries `@since <version>` and `@stability experimental | stable | internal`, plus an `@example`; the `trpcdev/jsdoc` lint rule enforces it ([`acronym-casing.md`](./acronym-casing.md), Q21.4).
- An experimental export's name starts with `unstable_` (`unstable_durableLink`). Promoting it to stable adds the unprefixed name and keeps `unstable_*` as an alias tagged `@deprecated Use <name>`, removed in the next major. The codemod rewrites the alias.
- (agent, tentative) Built, 2026-10-16. Before this, all 468 public exports were tagged `experimental`, because the package is alpha; prefixing them all would rename the whole API. So `@stability` now says how an export is planned to ship in 12.0.0, and prereleases promise nothing (`docs/README.md`). The core is `stable`. Experimental for now: `unstable_durable`, `unstable_durableLink` (the human's example; mid-stream resume is still a spike) and `unstable_generateOpenApiFromTypes` (built on TypeScript's `typescript/unstable/sync`).
  - Only values (functions, classes, consts) carry the prefix. Their option types are tagged `experimental` but keep their names (`DurableLinkOptions`), as v11 did for `unstable_httpBatchStreamLink`.
  - `trpcdev/jsdoc` enforces both directions. An `experimental` value must be named `unstable_*`, and an `unstable_*` value must be `experimental` or `@deprecated`. A `@deprecated` export must say `Use <name>`.
  - The codemod reads `PROMOTED` (`packages/upgrade/src/promoted.ts`, empty for now) and rewrites imports of promoted `unstable_*` names from `trpcdev` and `@trpcdev/*`.
- Open: which other features should start experimental. Candidates: `socketLink`/`messagePortLink`, `trpcdev/actions`, the Cloudflare hibernation adapter, the Lit/Preact/Angular integrations. The human picks; each one is a rename plus a tag.
- (agent) No separate experimental entry points. `trpcdev/internal` and `trpcdev/internal/testing` are the no-guarantee entry points ([`entry-points.md`](./entry-points.md), [`testing-helpers-internal.md`](./testing-helpers-internal.md)).
- Why: stability is visible at the import site; the deprecated alias keeps promotion non-breaking, which v11's `unstable_httpBatchStreamLink` rename wasn't.
- Lost: names that never change; promotion leaves an alias behind until the next major.
- Lives in: `tooling/oxlint-plugin/jsdoc.ts`, `tooling/oxlint-plugin/public-exports.ts`, `vite.config.ts` (`trpcdev/jsdoc` override), `packages/upgrade/src/promoted.ts`.
