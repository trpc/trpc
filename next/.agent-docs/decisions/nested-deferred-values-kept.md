# Nested deferred values are kept, with every serializer (human)

- Answers Q14.4 (proposal 14) with D-A, which the danSON decision made almost free: a `Promise`, `AsyncIterable`, `ReadableStream` or Effect `Stream` anywhere in an output streams after the rest of it, over HTTP (JSONL), SSE events and sockets ([`serializer.md`](./serializer.md), [`wire-protocol.md`](./wire-protocol.md)).
- Why: v11's `httpBatchStreamLink` already streamed nested promises; dropping them would be a regression, and danSON does it with no extra protocol.
- Lost: nothing in v1; REST (OpenAPI) responses still don't support deferred values ([`openapi.md`](./openapi.md)).
- Human, 2026-10-16 (Q14.4, decision round): "B but danson and other async serializers can likely pick a "shorter path" so we don't have to recursivelt step through everything twice". With plain JSON (the default) and sync serializers, the transport finds nested deferred values and streams them, as v11's `httpBatchStreamLink` did; a streaming serializer such as danSON does it in its own pass, so values aren't walked twice.
- Lives in: `packages/trpcdev/src/serializer/`, `src/server/fetch.ts`, `src/client/links/http.ts`; tests in `test/integration/batching-and-streaming.test.ts`.
