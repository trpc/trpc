# One trace across client and server, through Effect's tracer (agent)

- Follows [`effect-integration.md`](./effect-integration.md) (server spans) and [`effect-native-by-default.md`](./effect-native-by-default.md): tracing is Effect's `Tracer`, exported by `@effect/opentelemetry` or any `Tracer` layer, not a trpcdev plugin.
- (agent) Client spans: every call runs in `Stream.withSpan('trpc.<path>', { kind: 'client' })` with `rpc.system: 'trpc'`, `rpc.method` and `trpc.type`, and annotates `trpc.error.code` on failure. Spans opened by links nest under it.
- (agent) Propagation: when a non-native tracer is installed and `Tracer.DisablePropagation` is off, the operation carries `op.trace` (`traceparent` and `b3` from `HttpTraceContext.toHeaders`) and `httpLink` sends them as headers on the first operation of a request. With Effect's native tracer nothing is sent, so plain clients never add headers that would turn a simple request into a CORS preflight.
- (agent) Promise clients run on the native tracer, so they open spans but don't propagate. Exporting needs the Effect client (`trpcdev/effect`) run with a tracer layer, or an Effect program that provides one.
- (agent) Server: calls are parented to the request's `http.server` span (Effect's `HttpEffect` creates it from `traceparent`), or, on a bare `handler.fetch`, to the incoming `traceparent`/`b3` header. Calls run in the handler's runtime, so the parent is passed explicitly (`RunOpts.parent`).
- (agent) WebSocket calls aren't parented: one connection carries many calls and there is no per-message header. Later: a `trace` field on WS messages if someone needs it.
- Why: one trace from browser to resolver with Effect's own APIs; the only trpcdev code is span naming and header plumbing.
- Lost: always-on propagation like Effect's `HttpClient` default, and tracing on the Promise client without Effect.
- Lives in: `packages/trpcdev/src/client/link.ts` (`runOperation`), `src/client/links/http.ts`, `src/server/core.ts`, `src/server/fetch.ts` (`parentSpan`), `test/integration/tracing.test.ts`, `docs/procedures.md` (Tracing), `docs/client.md` (Tracing).
