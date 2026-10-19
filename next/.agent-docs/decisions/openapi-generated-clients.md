# The OpenAPI document is shaped for generated clients such as Hey API (human asked)

- Human, 2026-10-19, on a comparison of `@trpc12/trpc/openapi` with [Hey API](https://heyapi.dev) (`@hey-api/openapi-ts`) that found five gaps and proposed a page on generating a client with it: "sure". Hey API reads OpenAPI and writes clients; it never writes a document. So the document is the interop line: when it's correct, every Hey API plugin (SDKs, zod/valibot, TanStack Query, MSW, other languages) works on a tRPC API, with no SDK codegen of our own.
- (agent) `experimental_generateContractFromOpenApi` follows `$ref`s to parameters, request bodies and responses, applies path-level parameters, and types header parameters ([`openapi-to-contract.md`](./openapi-to-contract.md)). Before, a GitHub-style spec lost those inputs and outputs.
- Lost: SDK, HTTP-client, validator and mock generation of our own; Hey API covers them.
- Lives in: `packages/trpc/src/openapi/to-contract.ts`, `packages/trpc/src/openapi/to-contract.test.ts`, `packages/trpc/src/openapi/fixtures/generated/refs.ts`, `docs/openapi/from-document.md`.
