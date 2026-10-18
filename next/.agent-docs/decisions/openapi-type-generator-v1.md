# The OpenAPI scope is ratified, and the TypeScript-based generator ships in v1 (human)

- Human, 2026-10-15 (decisions round 3, Q21 = proposal 18 Q18.3): "B".
- [`openapi.md`](./openapi.md) stands as built: `experimental_createOpenApiHandler`, `experimental_generateOpenApi` (`target: 'openapi' | 'rpc'`), `experimental_openApiLink`, and schemas from Standard JSON Schema.
- v1 also ships a generator that reads the router's **types** with the TypeScript compiler. It documents what the runtime generator can't see:
  - Errors that are only inferred (returned or failed, never declared).
  - Procedures without static schemas, from their inferred input and output types.
- (agent) It runs as a build step or CLI over the file that exports the router, and is a separate entry so the TypeScript compiler isn't a runtime dependency. Where a procedure has a runtime schema, that schema wins, so the two generators agree.
- (agent) The docs UI (`experimental_openApiReference`) becomes handler middleware, not a plugin ([`plugins-are-effect-middleware.md`](./plugins-are-effect-middleware.md)).
- Why: with inferred errors, declarations are optional, so a runtime-only document would miss errors and types that the code already states.
- Lost: a smaller v1; document generation now depends on the TypeScript compiler.
- (agent) The former Open is answered: the entry name and the rendering of types without a JSON Schema form below, `.route({ spec })` in [`route-spec-override.md`](./route-spec-override.md), response validation in `experimental_openApiLink` in [`client-validation-link.md`](./client-validation-link.md), OpenAPI-to-contract in [`openapi-to-contract.md`](./openapi-to-contract.md).
- (agent) Built as `generateOpenApiFromTypes(router, { file, exportName = 'appRouter', tsconfig?, ...generateOpenApi options })` in `@trpc12/trpc/openapi/typescript`, on the TypeScript 7 `typescript/unstable/sync` API; `typescript` is an optional peer dependency. It walks each procedure's `'~trpc'['~types']` (`input`, `output`, `errors`, lazy subtrees through `'~types'`) and feeds the runtime generator through an internal hook, so runtime schemas still win. No CLI yet: it's a build-step function.
- (agent) Inferred error status: a `TrpcError.Tagged` class keeps `status` as a literal type, then the built-in code's status, then `400`. The runtime generator's default for a declared custom code changed from 500 to 400, matching `TrpcError`.
- (agent) Types render as `JSON.stringify` sends them: `Date` is `date-time`, `toJSON()` is followed, functions/symbols/`bigint`/`undefined` are dropped, branded primitives are their primitive, recursive types are `$ref`s into `components.schemas`, JSDoc becomes `description`.
- (agent) `experimental_openApiReference({ path = '/api/docs', specPath = '/api/openapi.json', docsProvider, title?, router + specGenerateOptions | document })` is an `HttpMiddleware`; `experimental_createOpenApiHandler` takes `middleware` instead of `plugins` (removed with `OpenApiPlugin`).
- Lives in: `packages/trpc/src/openapi/typescript.ts`, `packages/trpc/src/openapi/reference.ts`, `packages/trpc/src/openapi/generate.ts` (`generateDocument`), `packages/trpc/src/openapi/typescript.test.ts`, `packages/trpc/src/openapi/fixtures/typed-router.ts`, `docs/openapi/document.md`.
