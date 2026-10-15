# Root extensions via `t.with(ext)` ship in v1 (human)

- Alex, 2026-10-15 (decisions round 3, Q12 = proposal 03 Q3.6): "A".
- `initTrpc<{ ctx: Ctx }>().with(ext)` adds what an extension brings from values: meta keys, ctx, error codes and Effect services. Extensions chain: `.with(openapi()).with(rateLimit({ per: 'user' }))`.
- (agent) Values go through `.with()` rather than `initTrpc<{…}>()` because TypeScript has no partial type-argument inference: the caller's `ctx` type argument and the extension's inferred types can't share one call.
- (agent) An extension is plain data plus types (meta schema, ctx additions, error codes, a `Layer` for its services), not a plugin hook into the protocol ([`plugins-are-effect-middleware.md`](./plugins-are-effect-middleware.md)). Call-level behaviour it needs goes through root middleware.
- Why: packages like rate limiting or auth can add typed meta, ctx and errors without each app restating them.
- Lost: a smaller v1 surface; extension typing must be kept stable once published.
- Open: spike the typing first (chained inference, conflicting meta keys, error-code merging); how it relates to `.concat()` for router/procedure fragments; whether OpenAPI's built-in `.route()` becomes an extension.
- Lives in: `packages/trpcdev/src/server/init.ts` (not built yet).
