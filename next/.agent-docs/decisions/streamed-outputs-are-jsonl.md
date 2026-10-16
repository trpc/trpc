# Queries and mutations that return streams answer with JSONL; subscriptions use SSE (agent)

- Answers Q10.5 (proposal 10), unanswered by Alex: a query or mutation whose output is (or contains) an async iterable, a `Stream` or a promise streams as `application/jsonl`; subscriptions are SSE ([`fetch-sse.md`](./fetch-sse.md)). Batches are JSONL too, so one decoder reads both ([`wire-protocol.md`](./wire-protocol.md)).
- Why: JSONL carries danSON's chunk references and batch frames as plain lines, needs no event names, and is what v11's `httpBatchStreamLink` sent. SSE's reconnect semantics (`Last-Event-ID`) only matter for subscriptions.
- Lost: reading a streamed query with `EventSource`.
- Lives in: `packages/trpcdev/src/server/fetch.ts` (`CONTENT_TYPE.jsonl`), `src/client/links/http.ts`; tests in `test/integration/batching-and-streaming.test.ts`.
