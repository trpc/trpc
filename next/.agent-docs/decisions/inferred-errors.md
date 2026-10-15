# Errors are inferred; `.errors()` declarations are optional (human)

- Alex, 2026-10-15 (decisions round 3, Q7 = proposal 07 Q7.2): "We shouldn't need errors declarations, that's only needed for openapi I think. We should allow returning errors both A or C".
- Promise resolvers and middleware may return an error (`return post ?? error({ code: 'NOT_FOUND' })`); Effect code fails with it (`Effect.fail(error(…))`). Both are inferred into the procedure's error union, `defined: true` on the client.
- (agent) `.errors({ … })` stays as an optional addition, for what inference can't see: OpenAPI (statuses and `data` schemas in the document), contracts (no resolver to infer from), and errors thrown from deep inside Promise helpers (a `throw` has no type).
- Why: typed errors without ceremony; the declaration is metadata for tools, not a requirement.
- Lost: nothing; this is what's built.
- Lives in: `packages/trpcdev/src/internal/error.ts`, `src/server/declared.ts`, `docs/procedures.md`.
