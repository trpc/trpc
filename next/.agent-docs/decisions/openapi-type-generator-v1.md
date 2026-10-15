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
- Open: the entry name (`trpcdev/openapi/typescript`?); how types without a JSON Schema form (functions, branded types) are rendered; still later: `.route({ spec })` overrides, response validation in `openApiLink`, OpenAPI-to-contract.
- Lives in: `packages/trpcdev/src/openapi/` (the type generator is not built yet).
