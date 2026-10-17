# `@trpc12/trpc` imports no Node; it is built on `effect/http` (human)

- Human, 2026-10-11: "in the server package, we don't wanna import from node directly and instead use Effect's runtime and dependency injection for node etc". `@trpc12/trpc` has no `node:*` imports and no `@types/node`; its only dependency stays `effect` ([`effect-dependency.md`](./effect-dependency.md)).
- Human, later: "If effect depends on a lib it's okay but maybe it'd be better to use dependency injection of something that you provide when setting up the respnsne handlers". The platform layer is that injected dependency, so `ws` arriving through `@effect/platform-node` is fine and there is no hand-written WebSocket server.
- (agent) `@trpc12/trpc/http` replaces the removed `@trpc12/trpc/node`:
  - `toHttpEffect(handler, { endpoint?, allowOrigin? })` turns a fetch handler into an Effect HTTP app. WebSocket upgrades to the endpoint go through `HttpServerRequest.upgrade` and reach `handler.websocket()` as a standard `WebSocket`-shaped object ([`websocket-standard-interface.md`](./websocket-standard-interface.md)). Upgrades elsewhere get a 404, a disallowed origin a 403.
  - `serve(handler, opts)` is `HttpServer.serve(toHttpEffect(handler, opts))`, a `Layer` that needs an `HttpServer`.
  - The app provides the platform: `NodeHttpServer.layer(createServer, { port })` from `@effect/platform-node`, or `BunHttpServer.layer`. WebSocket limits such as `maxPayload` are that layer's options (`websocket: { maxPayload }` on Node).

  ```ts
  serve(handler).pipe(
    Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
    Layer.launch,
    NodeRuntime.runMain,
  );
  ```

- (agent) Apps served this way run interruptibly, so a client disconnect aborts the call's `signal`. `HttpServer` runs plain apps uninterruptibly; Effect's `HttpRouter` opts routes in the same way.
- (agent) `@trpc12/trpc/testing`'s `createTestServer` takes the platform layer as `http`. Node-only test helpers (dropping connections, the raw server) live in the suites' own fixtures.
- Why: platform access is dependency injection. The core says what it needs and the app provides Node, Bun or a test server, which Effect's platform packages already do. Fetch-native runtimes (Deno, Bun, Cloudflare, browsers) still use `handler.fetch` and `handler.websocket` directly.
- Lost: `@trpc12/trpc/node` as a platform subpath (proposal 12 P-A) and a separate `@trpc12/node` (duplicates `@effect/platform-node`). Node users add `@effect/platform-node` to serve over `node:http`.
- Human, 2026-10-15 (Q12.3): "I think we should be able to get all of these for free through Effect and build them the way effect does", then "Do effect native ones but also provide adapters for the rest, build the handler in the way effect does for injecting different runtimes".
  - Effect-native, with a docs recipe each: Node, Bun and Deno (`serve` plus the platform's `HttpServer` layer); Express and Fastify (`NodeHttpServer.makeHandler(toHttpEffect(handler))` gives a `(req, res)` handler to mount); fetch runtimes (Workers, Next route handlers, Lambda function URLs) through `handler.fetch` or `HttpEffect.toWebHandler`.
  - Our own adapters where Effect has none, built the same way (the runtime injected as a layer or service, the handler core platform-free): AWS Lambda API Gateway events and Cloudflare WebSocket hibernation. Each is a `@trpc12/trpc/*` subpath if it needs no dependencies, otherwise a `@trpc12/*` package ([`integration-packages.md`](./integration-packages.md)).
- (agent) Bun: `packages/trpc/src/http/serve.bun.test.ts` serves through `BunHttpServer.layer` under `bun test` in CI's `bun` job, covering batched queries with rich types, files both ways, SSE with resume, `wsLink` and disconnect aborts. It's its own suite rather than the Node integration suite on Bun, because that suite's fixtures drop connections through `node:http` and run on Vitest.
- (agent) The Lambda adapter is built: `@trpc12/trpc/aws-lambda` ([`aws-lambda-adapter.md`](./aws-lambda-adapter.md)).
- Human, 2026-10-16 (Q12.1, decision round): "B". All-in on `effect/http` (proposal 12 P-B): the handler is `HttpRouter` routes, fetch platforms go through `HttpRouter.toWebHandler`, and `effect/http` being `@stability unstable` is accepted.
  - (agent) Built: `handler.routes` is an `HttpRouter` layer, a `*` route on `${endpoint}/*` (which also matches the endpoint itself) that serves calls and WebSocket upgrades through the handler's `middleware`. `handler.fetch` is `HttpRouter.toWebHandler` of the same app. `serve(handler)` is `HttpRouter.serve(handler.routes)`, so other paths get the router's 404; with an explicit `endpoint` option, or a handler that isn't `createFetchHandler()`'s, it keeps serving `toHttpEffect(handler)`. `TestServer` serves `routes`, so the integration suite runs through the router.
  - (agent) Kept: `toHttpEffect` stays as the single-app form for `NodeHttpServer.makeHandler` (Express, Fastify) and for wrapping non-tRPC fetch handlers. The OpenAPI and v11 interop handlers still expose only `fetch`; routes for them come with the `openapi()` extension work.
- Lives in: `packages/trpc/src/http/index.ts`, `src/server/routes.ts`, `src/server/upgrade.ts`, `src/internal/testing/index.ts`, `packages/trpc/src/fixtures/server.ts`, `src/http/serve.bun.test.ts` (with `tsconfig.bun.json`), `.github/workflows/next.yml` (`bun`), `docs/adapters/bun.md`.
