# Procedures may return an `HttpServerResponse` on unbatched HTTP calls (human)

- Alex, 2026-10-15 (decisions round 3, Q11 = proposal 04 Q4.3): "Do c". Neither tRPC v11 nor oRPC lets a procedure return a response.
- A resolver may return Effect's `HttpServerResponse` (the core's response type, [`http-core-on-effect-http.md`](./http-core-on-effect-http.md)); a web `Response` is accepted and converted with `HttpServerResponse.fromWeb`. It is sent as is: status, headers, body (redirects, proxied upstreams, streams).
- (agent) Only unbatched HTTP calls carry it. In a batch, over WebSockets or MessagePorts, or in-process, the call fails with `BAD_REQUEST`. Clients get a web `Response` as the output (the type is `Response`), so `httpLink` must not batch such procedures; the procedure is marked at build time so the link can send it alone.
- (agent) OpenAPI routes send it as the route's response; the document describes it as an untyped response.
- Why: proxies, redirects and pre-built responses without leaving tRPC for a separate route.
- Lost: one transport-independent output type for every procedure.
- Open: how the client learns a procedure returns a response before calling (a response header is too late for batching); likely a type-level marker the link reads through call options, like `switchLink`.
- Lives in: `packages/trpcdev/src/server/fetch.ts`, `src/client/links/http.ts` (not built yet).
