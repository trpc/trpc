# One builder for Promise and Effect code; services are inferred (human)

- Q2.1: A1. One builder detects `Effect`, `Stream`, `AsyncIterable` and `Promise` returns at runtime.
- Q2.2: S1, inferred services, against proposal 02's S2. With plain-object routers ([`routers.md`](./routers.md)) nothing carries a declared set, so S2 would need the handler to be given `t`. Under S1 the router type carries `R`, and the handler's `layer` must provide `inferRouterServices<typeof router>`.
- Q2.3: d.ii. A resolver whose `Effect` or `Stream` can fail with something other than a `TrpcError` is a compile error ("Map Effect failures to a TrpcError (e.g. Effect.catchTag) before returning them"); the same goes for Effect middleware bodies and `.provide()` factories. At runtime d.i stays as a safety net: an unmapped failure becomes a masked `INTERNAL_SERVER_ERROR`.
- `call(procedure, input, { ctx, layer })` and `createRouterClient(router, { ctx, layer })` take a `layer`.
- (agent, 02 (e)) Tracing: `callProcedure` runs every call in `Effect.withSpan('trpc.<path>', { kind: 'server' })` with `rpc.system: 'trpc'`, `rpc.method` and `trpc.type`, and annotates `trpc.error.code` on failure. A tracer in the handler's `layer` exports them; with none, Effect's native spans cost a few allocations per call. Client spans and `traceparent` propagation: [`tracing-across-client-and-server.md`](./tracing-across-client-and-server.md).
- Lost: S2 (a declared service set on `t`); d.i alone (failures silently masked).
- Human, 2026-10-16 (Q2.1, Q2.2, Q2.3, decision round): "A. I don't really get this right now, might be changed later".
- Tentative (human): "I don't really get this right now, might be changed later". Challenge it when it gets in the way.
- Lives in: `packages/trpc/src/server/execute.ts`, `builder.ts`, `src/effect/index.ts`, `test/integration/effect.test.ts`.
