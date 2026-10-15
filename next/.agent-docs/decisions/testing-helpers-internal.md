# Test servers are Effect-native, under a semi-public `internal/testing` entry (human)

- Alex, 2026-10-15 (decisions round 3, Q8 = proposal 01 Q1.4): "Internal and only Effect native form", then "We may wanna do the testing public but it can be in like a semi public internal/testing/* entrypoint for now?".
- `trpcdev/testing` moves to `trpcdev/internal/testing`: importable, but marked `@stability internal`, with no compatibility promise. It may become public later.
- Its form is Effect-only: a `TestServer` layer and service (url, wsUrl, recorded requests) over the platform layer the test provides, used with `@effect/vitest`'s `it.layer`. No `await using` Promise helper.
- Users test in process with `createRouterClient` or `localLink`, and serve over a real port with `serve()` and their platform layer.
- Why: our suites and early adopters can share a harness without freezing its API; an Effect layer is how tests compose servers.
- Lost: a stable, documented real-server harness for users for now (#7030, #2468; `localLink` and `implement()` stubs answer most of them).
- Lives in: `packages/trpcdev/src/testing/`, `test/integration/fixtures/server.ts` (not converted yet).
