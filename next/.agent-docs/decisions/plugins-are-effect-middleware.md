# No plugin interface: Effect HTTP middleware and root middleware instead (human)

- Alex, 2026-10-15 (decisions round 3, Q10 = proposal 13 Q13.1 to Q13.3): "C".
- Request-level concerns (CORS, rate limits, logging, auth headers) are Effect `HttpMiddleware` around the handler's `effect/http` app: `createFetchHandler({ router, middleware: [HttpMiddleware.cors({ … })] })`. `serve()`'s `allowOrigin` becomes Effect's CORS middleware.
- Call-level concerns are root `t.use()` middleware.
- Protocol rules stay fixed handler options: `maxBodySize`, batching opt-in, mutations over `POST`, JSON-only `POST` bodies (CSRF). They can't be turned off by a plugin.
- Why: Effect already ships CORS, logging and tracing middleware; a second middleware system would duplicate both layers. Follows [`http-core-on-effect-http.md`](./http-core-on-effect-http.md).
- Lost: an oRPC-style `{ onRequest, onCall }` plugin interface and switch-off-able protocol features.
- Lives in: `packages/trpcdev/src/server/fetch.ts`, `src/http/index.ts` (`middleware` option not built yet).
