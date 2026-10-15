# Subscriptions are fetch-streamed SSE, following the SSE standard (human)

- Alex, 2026-10-09 (Q14.5): "hell yes, but follow the sse standards". The client reads SSE with `fetch` streaming, not `EventSource`, and the wire format is the [WHATWG event-stream format](https://html.spec.whatwg.org/multipage/server-sent-events.html): `text/event-stream`, `event:`/`data:`/`id:` fields, comment lines for keep-alives, resume with `Last-Event-ID`. The client parser follows the spec's rules (line endings, the leading space after the colon).
- Why: `fetch` gives headers, POST bodies and abort without a polyfill, and a standard stream stays readable by `EventSource`, `curl`, proxies and other languages.
- Lost: nothing; v11 needed a polyfill for headers.
- (agent) Event mapping: each `data:` is one serialized value; `tracked(id, data)` sets `id:`; `event: error` carries a serialized error and `event: done` ends the stream. Deferred values inside events are `event: deferred` with `data: { e, body }`, their chunks `event: chunk` with `{ e, chunk }`, and `{ e }` alone ends them; later events aren't held back.
- (agent) Every SSE response starts with an `: open` comment. Node's server and some proxies hold headers until the first body chunk, so a quiet subscription would otherwise have no response at all. OpenAPI subscriptions do the same.
- (agent) Keep-alives: the RPC handler writes `: ping` every `sse.pingMs` (default 15 s, `false` for none) while a subscription is open. Proxies commonly drop connections idle for 60 s or more. OpenAPI subscriptions don't ping yet.
- Open: test against a real `EventSource`.
- Lives in: `packages/trpcdev/src/server/fetch.ts`, `src/internal/protocol.ts` (`parseSse`), `src/openapi/handler.ts`.
