# The handler core is built on `effect/http` (human)

- Alex, 2026-10-15 (decisions round 3, Q4 = proposal 12 Q12.1): "C" (proposal 12 P-B), after the trade-offs below were laid out.
- The core takes Effect's `HttpServerRequest` and returns `HttpServerResponse`. `handler.fetch` is that app through `HttpEffect.toWebHandler`; `serve()` and `toHttpEffect` use it directly, so Node no longer converts its request into a web `Request`.
- `createContext` receives the `HttpServerRequest` (on fetch runtimes, `request.source` is the original web `Request`).
- Q2.4 follows: the core may depend on Effect modules marked `@stability unstable` (`effect/http` is), pinned and tested.
- Why: Effect end to end, matching [`internals-use-effect.md`](./internals-use-effect.md) and [`platforms-through-effect-layers.md`](./platforms-through-effect-layers.md); Effect's request already wraps both Node's `IncomingMessage` and web `Request`.
- Lost: a web-standard `Request` in `createContext`; independence from `effect/http`'s API churn; a few allocations per call on fetch runtimes for the wrapper.
- (agent) In-process callers (`localLink`, `createRouterClient`, `call`, actions, `createTrpcRsc`) pass no request: they take `ctx` (a value or a function) and the handler's `createContext` never runs, so there's nothing to fake. Effect-native reading: the request is an HTTP fact, not a service every call has; code that needs one builds it (`HttpServerRequest.fromWeb`), as `docs/procedures.md` shows. Lost: one `createContext` for HTTP and in-process calls.
- (agent) WebSocket and MessagePort connections get `HttpServerRequest.fromWeb` of their upgrade request; Node upgrades in `toHttpEffect` keep Effect's request. The platform value (`fetch(request, env)`) reaches `createContext` through the `CurrentPlatform` reference.
- (agent) The OpenAPI handler still reads a web `Request` internally and wraps it for `createContext`; moving it onto the app is left for the OpenAPI generator work.
- Lives in: `packages/trpcdev/src/server/fetch.ts`, `src/server/core.ts`, `src/server/socket.ts`, `src/http/index.ts`; tests in `test/integration/http-core.test.ts`; docs in `docs/platforms.md`, `docs/procedures.md` ("Calling procedures on the server").
