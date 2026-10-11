# 0018 — `trpcdev` imports no Node; platforms come from Effect layers

| Proposal                                                                                                     | Date       | Status   | Supersedes                                                                          | Superseded by |
| ------------------------------------------------------------------------------------------------------------ | ---------- | -------- | ----------------------------------------------------------------------------------- | ------------- |
| [12](../proposals/12-handlers-adapters-platforms.md), [01](../proposals/01-packages-and-type-portability.md) | 2026-10-11 | accepted | [0015](./0015-agent-judgement-calls-v12-build.md) `trpcdev/node` and "no `ws`" rows | —             |

## Decision

- Alex: "in the server package, we don't wanna import from node directly and instead use Effect's runtime and dependency injection for node etc".
- `trpcdev` has no `node:*` imports and no `@types/node`. Its only dependency stays `effect` (0004).
- The `trpcdev/node` entry point (the `node:http` listener and the hand-written RFC 6455 server) is gone. `trpcdev/http` replaces it:
  - `toHttpEffect(handler, { endpoint?, allowOrigin? })` turns a fetch handler into an Effect HTTP app. WebSocket upgrades to the endpoint go through `HttpServerRequest.upgrade` and reach `handler.websocket()` as a standard `WebSocket`-shaped object (0005). Upgrades elsewhere get a 404, a disallowed origin a 403.
  - `serve(handler, opts)` is `HttpServer.serve(toHttpEffect(handler, opts))`: a `Layer` that needs an `HttpServer`.
- The platform is a layer the app provides, e.g. `NodeHttpServer.layer(createServer, { port })` from `@effect/platform-node` or `BunHttpServer.layer` from `@effect/platform-bun`. WebSocket limits such as `maxPayload` are that layer's options (`websocket: { maxPayload }` on Node, which uses `ws`).

  ```ts
  serve(handler).pipe(
    Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
    Layer.launch,
    NodeRuntime.runMain,
  );
  ```

- `trpcdev/testing`'s `createTestServer` takes the platform layer as `http`. Node-specific test helpers (dropping connections, the raw server) live in the test suites' own fixtures.

The following are agent judgement calls, cheap to revisit:

- Apps served this way run interruptibly, so a client disconnect aborts the call's `signal`. `HttpServer` runs plain apps uninterruptibly; Effect's `HttpRouter` opts routes in the same way.
- SSE responses (RPC subscriptions and OpenAPI) start with an `: open` comment. Node's server, and some proxies, hold headers until the first body chunk; without the comment a quiet subscription has no response until its first event.

## Rationale

Platform access is dependency injection: the core describes what it needs and the app provides Node, Bun or a test server. That is what Effect's platform packages already do, so we reuse them instead of maintaining an HTTP and WebSocket implementation per runtime. Fetch-native runtimes (Deno, Bun, Cloudflare, browsers) still use `handler.fetch` and `handler.websocket` directly.

What we give up: Node users add `effect` platform packages (`@effect/platform-node`, which brings `ws`) to serve over `node:http`. 0015 had avoided the `ws` dependency.

## Rejected alternatives

- Keep `trpcdev/node` as a platform subpath (proposal 12 P-A): it is the Node import Alex asked to remove.
- A separate `@trpcdev/node` package: duplicates `@effect/platform-node`.

## Parity impact

The WebSockets row in `../reference/orpc-parity.md` names `trpcdev/http` instead of `toNodeUpgradeListener`. Status is unchanged.

## Follow-ups

- [x] Remove `trpcdev/node`; add `trpcdev/http`; move tests and the example to `@effect/platform-node`.
- [ ] Alex answers Q12.1 in proposal 12; this decision leans toward P-B/P-C.
- [ ] Run the integration suite against `@effect/platform-bun` as well.
