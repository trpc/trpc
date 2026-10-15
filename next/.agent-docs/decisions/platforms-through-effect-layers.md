# `trpcdev` imports no Node; platforms come from Effect layers (human asked)

- Alex, 2026-10-11: "in the server package, we don't wanna import from node directly and instead use Effect's runtime and dependency injection for node etc". `trpcdev` has no `node:*` imports and no `@types/node`; its only dependency stays `effect` ([`effect-dependency.md`](./effect-dependency.md)).
- Alex, later: "If effect depends on a lib it's okay but maybe it'd be better to use dependency injection of something that you provide when setting up the respnsne handlers". The platform layer is that injected dependency, so `ws` arriving through `@effect/platform-node` is fine and there is no hand-written WebSocket server.
- (agent) `trpcdev/http` replaces the removed `trpcdev/node`:
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
- (agent) `trpcdev/testing`'s `createTestServer` takes the platform layer as `http`. Node-only test helpers (dropping connections, the raw server) live in the suites' own fixtures.
- Why: platform access is dependency injection. The core says what it needs and the app provides Node, Bun or a test server, which Effect's platform packages already do. Fetch-native runtimes (Deno, Bun, Cloudflare, browsers) still use `handler.fetch` and `handler.websocket` directly.
- Lost: `trpcdev/node` as a platform subpath (proposal 12 P-A) and a separate `@trpcdev/node` (duplicates `@effect/platform-node`). Node users add `@effect/platform-node` to serve over `node:http`.
- Open: Q12.1 in proposal 12 is Alex's; this leans toward P-B/P-C. Run the integration suite against `@effect/platform-bun` too.
- Lives in: `packages/trpcdev/src/http/index.ts`, `src/testing/index.ts`, `test/integration/fixtures/server.ts`.
