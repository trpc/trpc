# `.route({ spec })` overrides the generated OpenAPI operation; functions compose (agent)

- Closes the `.route({ spec })` Open in [`openapi.md`](./openapi.md) and [`openapi-type-generator-v1.md`](./openapi-type-generator-v1.md). Mirrors oRPC's `route.spec`: an object replaces the generated operation, a function receives it and returns the new one.
- (agent) `.route()` calls merge (later keys win), except `spec` functions, which compose: the earlier one runs first. A base procedure (`authed.route({ spec: addSecurity })`) and its leaves both apply, which covers oRPC's `oo.spec(middleware, …)` without a second helper. An object `spec` replaces whatever came before.
- (agent) Only `target: 'openapi'` applies it: the `rpc` target documents @trpc12/trpc's own endpoint, whose shapes a REST override wouldn't match. `experimental_toContract()` drops `spec`: it can be a function and only matters to the document.
- (agent) `OperationSpec` is an open record, not a full OpenAPI type: @trpc12/trpc doesn't model the whole OpenAPI vocabulary, and extensions (`x-*`) must pass.
- Lost: oRPC's `oo.spec()` on errors and middleware.
- (agent) 2026-10-16: `.route()` became the `route` meta key of the `experimental_openapi()` extension ([`root-extensions.md`](./root-extensions.md)). The merge above is that key's `mergeMeta` function, so `.meta({ route })` calls merge the same way; `.concat()` no longer carries a route.
- Lives in: `packages/trpc/src/server/procedures/procedure.ts` (`Route.spec`, `mergeRoute`), `src/server/procedures/builder.ts`, `src/server/procedures/implement.ts`, `src/contract/index.ts`, `src/openapi/generate.ts`, `src/internal/describe.ts` (`procedureJson`), `packages/trpc/src/openapi/openapi.test.ts`, `docs/openapi/routes.md`.
