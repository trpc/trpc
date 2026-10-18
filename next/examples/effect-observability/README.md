# Effect observability example

One OpenTelemetry trace from a client span, through the server's middleware and services, to work that runs after the response. Two services, `web` (the client) and `api` (the server), each install `@effect/opentelemetry`'s `NodeSdk.layer` and export into memory, so the smoke and the tests can read the spans.

```
signup.submit [web]                 Effect.withSpan around the call
  trpc.user.signup [web]            the client's span; httpLink sends traceparent and b3
    POST [web]                      Effect's HTTP client
      trpc.user.signup [api]        the server's span, in the same trace
        db.users.insert [api]       a service's span, nested under the call
        mailer.welcome [api]        Effect.forkDetach: ends after the response
```

- `server.ts`: the router. The tracer goes in the handler's `layer` next to the services ([Server tracing](../../docs/server/effect.md#tracing)). `user.me` runs an Effect middleware that provides `CurrentUser` and tags the call's span with `enduser.id`; `user.signup` sends its welcome mail with `Effect.forkDetach`, so the call answers first ([Work after the response](../../docs/server/effect.md#work-after-the-response)).
- `telemetry.ts`: `NodeSdk.layer` with an in-memory exporter. In an app, pass an OTLP exporter (`@opentelemetry/exporter-trace-otlp-http`) instead.
- `index.ts`: the smoke. It serves the API, calls it with `createEffectClient` under the `web` SDK ([Client tracing](../../docs/client/tracing.md)), prints the three traces and checks their shape.
- `server.test.ts`: the same checks as tests, on `@trpc12/trpc/internal/testing`'s `TestServer` with `@effect/vitest`'s `it.layer`. `TestServer` has no compatibility promise.

`@effect/opentelemetry`'s root entry also loads its browser SDK, which needs `@opentelemetry/sdk-trace-web`; on Node, import `@effect/opentelemetry/NodeSdk` directly.

Run it from `next/` with `pnpm example` (or here with `pnpm smoke`); `pnpm test` runs the tests.
