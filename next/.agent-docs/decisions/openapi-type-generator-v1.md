# The OpenAPI scope is ratified, and the TypeScript-based generator ships in v1 (human)

- Alex, 2026-10-15 (decisions round 3, Q21 = proposal 18 Q18.3): "B".
- [`openapi.md`](./openapi.md) stands as built: `createOpenApiHandler`, `generateOpenApi` (`target: 'openapi' | 'rpc'`), `openApiLink`, and schemas from Standard JSON Schema.
- v1 also ships a generator that reads the router's **types** with the TypeScript compiler. It documents what the runtime generator can't see:
  - Errors that are only inferred (returned or failed, never declared).
  - Procedures without static schemas, from their inferred input and output types.
- (agent) It runs as a build step or CLI over the file that exports the router, and is a separate entry so the TypeScript compiler isn't a runtime dependency. Where a procedure has a runtime schema, that schema wins, so the two generators agree.
- (agent) The docs UI (`openApiReference`) becomes handler middleware, not a plugin ([`plugins-are-effect-middleware.md`](./plugins-are-effect-middleware.md)).
- Why: with inferred errors, declarations are optional, so a runtime-only document would miss errors and types that the code already states.
- Lost: a smaller v1; document generation now depends on the TypeScript compiler.
- (agent) The former Open is answered: the entry name and the rendering of types without a JSON Schema form below, `.route({ spec })` in [`route-spec-override.md`](./route-spec-override.md), response validation in `openApiLink` in [`client-validation-link.md`](./client-validation-link.md), OpenAPI-to-contract in [`openapi-to-contract.md`](./openapi-to-contract.md).
- (agent) Built as `generateOpenApiFromTypes(router, { file, exportName = 'appRouter', tsconfig?, ...generateOpenApi options })` in `trpcdev/openapi/typescript`, on the TypeScript 7 `typescript/unstable/sync` API; `typescript` is an optional peer dependency. It walks each procedure's `'~trpc'['~types']` (`input`, `output`, `errors`, lazy subtrees through `'~types'`) and feeds the runtime generator through an internal hook, so runtime schemas still win. No CLI yet: it's a build-step function.
- (agent) Inferred error status: a `TrpcError.Tagged` class keeps `status` as a literal type, then the built-in code's status, then `400`. The runtime generator's default for a declared custom code changed from 500 to 400, matching `TrpcError`.
- (agent) Types render as `JSON.stringify` sends them: `Date` is `date-time`, `toJSON()` is followed, functions/symbols/`bigint`/`undefined` are dropped, branded primitives are their primitive, recursive types are `$ref`s into `components.schemas`, JSDoc becomes `description`.
- (agent) `openApiReference({ path = '/api/docs', specPath = '/api/openapi.json', docsProvider, title?, router + specGenerateOptions | document })` is an `HttpMiddleware`; `createOpenApiHandler` takes `middleware` instead of `plugins` (removed with `OpenApiPlugin`).
- Lives in: `packages/trpcdev/src/openapi/typescript.ts`, `packages/trpcdev/src/openapi/reference.ts`, `packages/trpcdev/src/openapi/generate.ts` (`generateDocument`), `test/integration/openapi-typescript.test.ts`, `test/integration/fixtures/typed-router.ts`, `docs/openapi.md`.
