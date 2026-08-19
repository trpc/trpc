---
'@trpc/client': patch
---

fix(client): abort in-flight fetch when httpLink or httpBatchLink unsubscribes

Both links passed `op.signal` directly into the fetcher with a `// noop` teardown, so calling `unsubscribe()` never aborted the underlying HTTP request. Each link now creates its own `AbortController`, races its signal with the caller-provided `op.signal` via `raceAbortSignals`, and calls `ac.abort()` in the observable cleanup — mirroring the fix already applied to `httpBatchStreamLink` in #7390.
