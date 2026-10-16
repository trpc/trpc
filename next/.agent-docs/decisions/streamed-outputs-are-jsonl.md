# Queries and mutations that return streams answer with JSONL; subscriptions use SSE (agent)

- Answers Q10.5 (proposal 10), unanswered by a human: a query or mutation whose output is (or contains) an async iterable, a `Stream` or a promise streams as `application/jsonl`; subscriptions are SSE ([`fetch-sse.md`](./fetch-sse.md)). Batches are JSONL too, so one decoder reads both ([`wire-protocol.md`](./wire-protocol.md)).
- Why: JSONL carries danSON's chunk references and batch frames as plain lines, needs no event names, and is what v11's `httpBatchStreamLink` sent. SSE's reconnect semantics (`Last-Event-ID`) only matter for subscriptions.
- Lost: reading a streamed query with `EventSource`.
- (agent) Skipped in the decision round, 2026-10-16; chose JSONL because it is built, one decoder reads batches and streams, and SSE gains nothing for non-subscriptions. The human's words: "Skip... I think nested promises etc might be a problem for sse but Spike it. Maybe danson or my devalue-async package did something here". So a spike of nested deferred values over SSE, checking danSON and `devalue-async`.
- Lives in: `packages/trpcdev/src/server/fetch.ts` (`CONTENT_TYPE.jsonl`), `src/client/links/http.ts`; tests in `test/integration/batching-and-streaming.test.ts`.
