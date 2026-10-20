# WebSocket and MessagePort calls carry trace context in a `trace` field (agent)

- (agent) Answers the "Later" in [`tracing-across-client-and-server.md`](./tracing-across-client-and-server.md). A socket `request` message gets an optional `trace`, the same `traceparent` and `b3` entries `httpLink` sends as headers (`HttpTraceContext.toHeaders` of the call span). The server reads it with `HttpTraceContext.fromHeaders` and passes it as the call's `parent`, so each call's server span is a child of its own client span.
- (agent) Per call, not per connection: one socket carries calls from many traces, so the upgrade request's `traceparent` would parent unrelated calls. Calls without `trace` start their own trace, as before.
- (agent) Same rule as HTTP for when it is sent: only with a non-native tracer and `Tracer.DisablePropagation` off. Plain clients send byte-identical messages to before.
- (agent) The server treats the field as untrusted: non-object values and non-string entries are ignored, and a malformed `traceparent` gives no parent.
- Why: Effect-native propagation through Effect's own trace-context codec, reusing the `op.trace` the client already computes; no new option.
- Lost: nothing; old clients don't send it and old servers ignore it.
- Lives in: `packages/trpc/src/internal/protocol.ts` (`ClientMessage`), `src/client/links/socket.ts` (`request`), `src/server/sockets/socket.ts` (`traceParent`), `packages/trpc/src/server/tracing.test.ts`, `www/docs/client/tracing.md`, `www/docs/server/effect.md` (Tracing).
