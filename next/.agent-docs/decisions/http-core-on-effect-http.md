# The handler core is built on `effect/http` (human)

- Human, 2026-10-15 (decisions round 3, Q4 = proposal 12 Q12.1): "C" (proposal 12 P-B), after the trade-offs below were laid out.
- The core takes Effect's `HttpServerRequest` and returns `HttpServerResponse`. `handler.fetch` is that app through `HttpEffect.toWebHandler`; `serve()` and `toHttpEffect` use it directly, so Node no longer converts its request into a web `Request`.
- `createContext` receives the `HttpServerRequest` (on fetch runtimes, `request.source` is the original web `Request`).
- Q2.4 follows: the core may depend on Effect modules marked `@stability unstable` (`effect/http` is), pinned and tested.
- Why: Effect end to end, matching [`internals-use-effect.md`](./internals-use-effect.md) and [`platforms-through-effect-layers.md`](./platforms-through-effect-layers.md); Effect's request already wraps both Node's `IncomingMessage` and web `Request`.
- Lost: a web-standard `Request` in `createContext`; independence from `effect/http`'s API churn; a few allocations per call on fetch runtimes for the wrapper.
- (agent) In-process callers (`localLink`, `createRouterClient`, `call`, actions, `createTrpcRsc`) pass no request: they take `ctx` (a value or a function) and the handler's `createContext` never runs, so there's nothing to fake. Effect-native reading: the request is an HTTP fact, not a service every call has; code that needs one builds it (`HttpServerRequest.fromWeb`), as `docs/server/server-side-calls.md` shows. Lost: one `createContext` for HTTP and in-process calls.
- (agent) WebSocket and MessagePort connections get `HttpServerRequest.fromWeb` of their upgrade request; Node and Bun upgrades under `@trpc12/trpc/http` keep Effect's request, the v11 handler's included. The platform value (`fetch(request, env)`) reaches `createContext` through the `CurrentPlatform` reference.
- (agent) The OpenAPI handler still reads a web `Request` internally and wraps it for `createContext`; moving it onto the app is left for the OpenAPI generator work.
- (agent) Calls over HTTP and sockets get their request (a socket's upgrade request) as the `HttpServerRequest` service, so Effect middleware reads headers with `Effect.serviceOption(HttpServerRequest.HttpServerRequest)` ([`durable-calls.md`](./durable-calls.md)). In-process calls still have none.
- Lives in: `packages/trpc/src/server/fetch.ts`, `src/server/core.ts`, `src/server/sockets/socket.ts`, `src/http/index.ts`; tests in `packages/trpc/src/http/core.test.ts`; docs in `docs/adapters/node.md`, `docs/server/server-side-calls.md`.
