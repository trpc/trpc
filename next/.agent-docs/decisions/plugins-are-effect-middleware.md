# No plugin interface: Effect HTTP middleware and root middleware instead (human)

- Human, 2026-10-15 (decisions round 3, Q10 = proposal 13 Q13.1 to Q13.3): "C".
- Request-level concerns (CORS, rate limits, logging, auth headers) are Effect `HttpMiddleware` around the handler's `effect/http` app: `createFetchHandler({ router, middleware: [HttpMiddleware.cors({ … })] })`. `serve()`'s `allowOrigin` becomes Effect's CORS middleware.
- Call-level concerns are root `t.use()` middleware.
- Protocol rules stay fixed handler options: `maxBodySize`, batching opt-in, mutations over `POST`, JSON-only `POST` bodies (CSRF). They can't be turned off by a plugin.
- Why: Effect already ships CORS, logging and tracing middleware; a second middleware system would duplicate both layers. Follows [`http-core-on-effect-http.md`](./http-core-on-effect-http.md).
- Lost: an oRPC-style `{ onRequest, onCall }` plugin interface and switch-off-able protocol features.
- (agent) `@trpc12/trpc/http` exports `cors(options)`, Effect's `HttpMiddleware.cors` that also answers `403` to WebSocket upgrades from origins it doesn't allow (browsers don't preflight upgrades). `serve({ allowOrigin })` is gone; pass `middleware: [cors({ allowedOrigins })]`.
- (agent) Q13.2 follows from "C": there are no plugins to switch on. What 13 proposed on by default is built in and always on: the body limit (`maxBodySize`), strict methods (queries `GET`/`QUERY`, mutations `POST`) and the CSRF rule (JSON-only `POST` bodies). The proposed opt-ins are Effect middleware or links: `cors()`, `rateLimit()`, `durable()`, `retryLink`, `dedupeLink`.
- Lives in: `packages/trpc/src/server/fetch.ts` (`middleware` option), `src/http/index.ts` (`cors`, `toHttpEffect`); tests in `test/integration/http-core.test.ts`, `test/integration/websockets.test.ts`.
