# One `httpLink` replaces v11's five HTTP links (agent)

- Answers Q17.4 (proposal 17): yes. `httpLink({ url, batch?, … })` sends single calls, opt-in batches (`batch: true`), streamed results (JSONL by negotiation), SSE subscriptions and `multipart/form-data` inputs ([`links.md`](./links.md), [`wire-protocol.md`](./wire-protocol.md)).
- (agent) The codemod rewrites `httpBatchLink`, `httpBatchStreamLink`, `httpSubscriptionLink` and `unstable_httpBatchStreamLink` to `httpLink`, adding `batch: true` where v11 batched ([`v11-codemod.md`](./v11-codemod.md)).
- Why: the server decides the response format from the output, so the client needn't pick a link per format; one link has one set of options.
- Lost: dropping streaming support from bundles that never stream.
- Lives in: `packages/trpcdev/src/client/links/http.ts`, `packages/upgrade/src/transform.ts`.
