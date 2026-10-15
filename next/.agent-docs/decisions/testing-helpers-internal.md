# Test servers are internal and Effect-native (human)

- Alex, 2026-10-15 (decisions round 3, Q8 = proposal 01 Q1.4): "Internal and only Effect native form".
- `trpcdev/testing` stops being a public entry point. Our suites get a `TestServer` layer and service (url, wsUrl, recorded requests) built on the platform layer they provide, used with `@effect/vitest`'s `it.layer`; no `await using` Promise helper.
- Users test in process with `createRouterClient` or `localLink`, and serve over a real port with `serve()` and their platform layer.
- Why: a public harness is API to keep stable for little gain over `localLink`; an Effect layer is how our own tests should compose servers.
- Lost: a ready-made real-server harness for users (#7030, #2468 asked for testing helpers; `localLink` and `implement()` stubs answer most of them).
- Lives in: `packages/trpcdev/src/testing/`, `test/integration/fixtures/server.ts` (not converted yet).
