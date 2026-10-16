# Errors are inferred; `.errors()` declarations are optional (human)

- Human, 2026-10-15 (decisions round 3, Q7 = proposal 07 Q7.2): "We shouldn't need errors declarations, that's only needed for openapi I think. We should allow returning errors both A or C".
- Promise resolvers and middleware may return an error (`return post ?? error({ code: 'NOT_FOUND' })`); Effect code fails with it (`Effect.fail(error(…))`). Both are inferred into the procedure's error union, `defined: true` on the client.
- (agent) `.errors({ … })` stays as an optional addition, for what inference can't see: OpenAPI (statuses and `data` schemas in the document), contracts (no resolver to infer from), and errors thrown from deep inside Promise helpers (a `throw` has no type).
- (agent) OpenAPI no longer needs declarations: `generateOpenApiFromTypes` (`@trpc12/trpc/openapi/typescript`) reads inferred errors and their statuses from the types ([openapi-type-generator-v1](./openapi-type-generator-v1.md)). Runtime `generateOpenApi` still documents declared errors only.
- (agent) Verified, with type assertions on the client's union: returned from a resolver, yielded or failed in an Effect resolver, returned from Promise middleware and failed in Effect middleware (`test/integration/errors.test.ts`).
- Why: typed errors without ceremony; the declaration is metadata for tools, not a requirement.
- Lost: nothing; this is what's built.
- Lives in: `packages/trpc/src/internal/error.ts`, `src/server/declared.ts`, `src/openapi/typescript.ts`, `test/integration/errors.test.ts`, `docs/procedures.md`.
