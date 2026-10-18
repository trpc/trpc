# OpenAPI example (experimental)

One router served over RPC (`/trpc`) and REST (`/api`), with an OpenAPI document generated from its types, a Scalar UI, and REST calls from `fetch` and from `experimental_openApiLink`. See [OpenAPI](../../../docs/openapi/overview.md).

Everything under `@trpc12/trpc/openapi` is `experimental_*` and may change in any release. The router itself uses stable APIs only: `t.router()` meta, `toContract()`, `toHttpEffect()` and `t.concat()`.

Run it from `next/` with `pnpm example`, or here with `pnpm smoke`.
