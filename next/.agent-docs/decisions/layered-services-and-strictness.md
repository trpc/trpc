# Layered services and strict procedures, proposed (agent)

- Human, 2026-10-18, after the Effect integration round: "can we also layer in deps in middlewares / base procedures / plugins? can we get it as strict as Effect rpc somehow? do some research and do proposals".
- (agent, tentative) The recommended picks in [proposal 27](../proposals/27-layered-services-and-strictness.md), until the human answers:
  - Q27.1: `.provide(layer)` on the builder, built once per handler in its runtime's memo map and scope, shared by reference with the handler's `layer`, and released by `dispose()`.
  - Q27.2: no per-call lifetime; Effect middleware with `Effect.provide(layer)` and `.provide(Key, effect)` already cover it.
  - Q27.3: middleware as an Effect service, an experimental `.use(Key)` with `MiddlewareImpl`, implemented by a layer (the `RpcMiddleware` shape).
  - Q27.4: an opt-in `.strict()` flag on a base procedure, which requires `.output()` and allows only declared errors.
  - Q27.5: contracts declare middleware with `c.use(Key)`.
- Not asked: router-level provide. Q6.4 ruled out router-level middleware ("Never", [middleware](./middleware.md)).
- Why: the spike ([layered-services-and-strictness](../notes/layered-services-and-strictness.md)) found:
  - a layer provided by a base procedure drops out of `inferRouterServices`, and its own requirements join it, with +3% instantiations;
  - Effect 4 builds layers once (`RpcGroup.toLayer`, `HttpApiBuilder.group`, `HttpRouter.provideRequest`) and provides per-request services through middleware, which is what the picks do;
  - contracts already check a procedure as `effect/rpc` checks a handler; `strict()` brings the same checks to the builder for +30% instantiations over declaring the output and errors.
- Lost: declared services on `t` (S2, Q2.2); eager layer building at handler startup; per-call layers as a builder option.
- Open: awaiting the human's answers to proposal 27. Nothing in `packages/` has changed.
- Lives in: `proposals/27-layered-services-and-strictness.md`, `notes/layered-services-and-strictness.md`, `spikes/layered-services/`.
