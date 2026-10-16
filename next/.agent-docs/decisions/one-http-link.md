# One `httpLink` replaces v11's five HTTP links (human)

- Answers Q17.4 (proposal 17): yes. `httpLink({ url, batch?, … })` sends single calls, opt-in batches (`batch: true`), streamed results (JSONL by negotiation), SSE subscriptions and `multipart/form-data` inputs ([`links.md`](./links.md), [`wire-protocol.md`](./wire-protocol.md)).
- (agent) The codemod rewrites `httpBatchLink`, `httpBatchStreamLink`, `httpSubscriptionLink` and `unstable_httpBatchStreamLink` to `httpLink`, adding `batch: true` where v11 batched ([`v11-codemod.md`](./v11-codemod.md)).
- Why: the server decides the response format from the output, so the client needn't pick a link per format; one link has one set of options.
- Lost: dropping streaming support from bundles that never stream.
- Human, 2026-10-16 (Q17.4, decision round): "A, make sure it adds some params where you can opt out of batching etc / Might be changed in the future for simple use cases". Each feature can be turned off on the link.
  - (agent) Built, 2026-10-16. Opt-outs on the link: `batch` (off by default), `subscriptions: false` (procedures lose `.subscribe()`), `binary` (off by default) and `reconnect.attempts`. Per call: `{ batch: false }` and `{ reconnect: false }`.
  - Open: there is no way to opt out of streamed results, because the server streams whenever an output holds deferred values. An opt-out would need the server to settle them when the client doesn't accept JSONL.
- Tentative (human): "Might be changed in the future for simple use cases". Challenge it when it gets in the way.
- Lives in: `packages/trpcdev/src/client/links/http.ts`, `packages/upgrade/src/transform.ts`.
