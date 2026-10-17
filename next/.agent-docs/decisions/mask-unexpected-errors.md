# Mask unexpected error messages in production (human)

- Human, 2026-10-09 (Q7.5): "yes". Thrown non-`TrpcError` values and undeclared failures reach the client as `INTERNAL_SERVER_ERROR` with a generic message; the original goes to `onError`. Declared and returned errors are user-facing and never masked.
- Why: unexpected errors leak internals (SQL, stack details). v11 relied on every app sanitising in a formatter.
- (agent) "Production" is any `NODE_ENV` other than `development` or `test`. Handlers opt out with `exposeUnexpectedErrors: true`. Every handler (fetch, sockets, OpenAPI) shares this through the handler core.
- Lives in: `packages/trpc/src/server/core.ts`; tested in `packages/trpc/src/server/errors.test.ts` and `src/openapi/openapi.test.ts`.
