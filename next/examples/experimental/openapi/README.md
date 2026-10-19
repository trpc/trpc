# OpenAPI example (experimental)

One router served over RPC (`/trpc`) and REST (`/api`), with an OpenAPI document generated from its types and a Scalar UI at `/api/docs`. See [OpenAPI](../../../docs/openapi/overview.md).

- `router.ts`: the router, with REST routes in `.meta({ route })`.
- `server.ts`: generates the document and serves both handlers on one port.
- `client.ts`: calls it with `httpLink`, with `fetch` (checking the inferred 404 is documented), and with `experimental_openApiLink`.

Everything under `@trpc12/trpc/openapi` and `@trpc12/trpc/contract` is `experimental_*` and might change or go away in any release. The rest is stable: `t.router()` meta, `toHttpEffect()` and `t.concat()`.

`pnpm start` runs both. `pnpm server` and `pnpm client` run them apart; the [examples README](../../README.md) has the layout.
