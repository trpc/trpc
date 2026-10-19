---
title: Tracing
description: Client spans that propagate `traceparent` and `b3`, so client and server share one trace.
section: Client
order: 7
---

Tracing is opt-in: install an Effect tracer and every call runs in a span named `trpc.<path>` (kind `client`), with `rpc.method`, `trpc.type` and `trpc.error.code` on failure. `httpLink` sends the span as `traceparent` and `b3` headers (`wsLink` puts them in each request message's `trace` field), and the server's `trpc.<path>` span joins the same trace ([Server tracing](../server/effect.md#tracing)):

```ts
import * as NodeSdk from '@effect/opentelemetry/NodeSdk';

const program = client.post.byId
  .query({ id })
  .pipe(Effect.withSpan('page.load'));
await Effect.runPromise(program.pipe(Effect.provide(NodeSdk.layer(otel))));
```

With no tracer (the Promise client, or Effect's default), calls open no span and send no headers or `trace` fields, so they cost nothing and simple requests stay free of CORS preflights. `Effect.provideService(Tracer.DisablePropagation, true)` keeps the spans and drops the headers.

[`examples/effect-observability`](../../examples/effect-observability/README.md) traces a client and a server with two `NodeSdk` layers and checks that their spans form one trace. Import `NodeSdk` from `@effect/opentelemetry/NodeSdk`: the package's root also loads its browser SDK, which needs `@opentelemetry/sdk-trace-web`.
