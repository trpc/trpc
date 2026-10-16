# Nested deferred values are kept (agent)

- Answers Q14.4 (proposal 14) with D-A, which the danSON decision made almost free: a `Promise`, `AsyncIterable`, `ReadableStream` or Effect `Stream` anywhere in an output streams after the rest of it, over HTTP (JSONL), SSE events and sockets ([`serializer.md`](./serializer.md), [`wire-protocol.md`](./wire-protocol.md)).
- (agent) Sync serializers and none frame only a root deferred value; nested ones need a streaming serializer, and their client types say so ([`replaceable-serializers.md`](./replaceable-serializers.md)).
- Why: v11's `httpBatchStreamLink` already streamed nested promises; dropping them would be a regression, and danSON does it with no extra protocol.
- Lost: nothing in v1; REST (OpenAPI) responses still don't support deferred values ([`openapi.md`](./openapi.md)).
- Lives in: `packages/trpcdev/src/serializer/`, `src/server/fetch.ts`, `src/client/links/http.ts`; tests in `test/integration/batching-and-streaming.test.ts`.
