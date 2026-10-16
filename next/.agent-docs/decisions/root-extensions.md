# Root extensions via `t.with(ext)` ship in v1 (human)

- Alex, 2026-10-15 (decisions round 3, Q12 = proposal 03 Q3.6): "A".
- `initTrpc<{ ctx: Ctx }>().with(ext)` adds what an extension brings from values: meta keys, ctx, error codes and Effect services. Extensions chain: `.with(openapi()).with(rateLimit({ per: 'user' }))`.
- (agent) Values go through `.with()` rather than `initTrpc<{…}>()` because TypeScript has no partial type-argument inference: the caller's `ctx` type argument and the extension's inferred types can't share one call.
- (agent) An extension is plain data plus types (meta schema, ctx additions, error codes, a `Layer` for its services), not a plugin hook into the protocol ([`plugins-are-effect-middleware.md`](./plugins-are-effect-middleware.md)). Call-level behaviour it needs goes through root middleware.
- Why: packages like rate limiting or auth can add typed meta, ctx and errors without each app restating them.
- Lost: a smaller v1 surface; extension typing must be kept stable once published.
- Open (the typing spike and `.concat()` are answered below): whether OpenAPI's built-in `.route()` becomes an extension.
- (agent) Spiked and built: an extension is a procedure builder from the package's own `initTrpc` (its root ctx = what it needs, its meta type = keys it adds, its default meta = defaults under the app's). `t.with(ext)` is `.concat()` lifted to the root, plus merged meta; it answers the `.concat()` part of the Open. Chained inference holds across `.with().with()`; `WithCheck` rejects missing ctx and meta keys declared with another type. Error codes merge as unions, as with `.concat()`.
- (agent) No `layer` field: an extension provides services per call with `.provide()` (or Effect middleware); services it only uses stay in the handler's `layer`. A shared `Layer` would need the handler to merge extension layers; left for when a package needs it. Whether `.route()` becomes an extension is still open.
- Lives in: `packages/trpcdev/src/server/init.ts` (`with`, `WithCheck`, `ExtendedDef`); tests in `test/integration/root-extensions.test.ts`; docs in `docs/procedures.md` (Root extensions).
