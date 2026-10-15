# One builder for Promise and Effect code; services are inferred (agent)

- Q2.1: A1. One builder detects `Effect`, `Stream`, `AsyncIterable` and `Promise` returns at runtime.
- Q2.2: S1, inferred services, against proposal 02's S2. With plain-object routers ([`routers.md`](./routers.md)) nothing carries a declared set, so S2 would need the handler to be given `t`. Under S1 the router type carries `R`, and the handler's `layer` must provide `inferRouterServices<typeof router>`.
- Q2.3: d.ii. A resolver whose `Effect` or `Stream` can fail with something other than a `TrpcError` is a compile error ("Map Effect failures to a TrpcError (e.g. Effect.catchTag) before returning them"); the same goes for Effect middleware bodies and `.provide()` factories. At runtime d.i stays as a safety net: an unmapped failure becomes a masked `INTERNAL_SERVER_ERROR`.
- `call(procedure, input, { ctx, layer })` and `createRouterClient(router, { ctx, layer })` take a `layer`.
- Lost: S2 (a declared service set on `t`); d.i alone (failures silently masked).
- Lives in: `packages/trpcdev/src/server/execute.ts`, `builder.ts`, `src/effect/index.ts`, `test/integration/effect.test.ts`.
