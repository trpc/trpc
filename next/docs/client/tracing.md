---
title: Tracing
description: Client spans that propagate traceparent and b3, so client and server share one trace.
section: Client
order: 7
---

Tracing is opt-in: install an Effect tracer and every call runs in a span named `trpc.<path>` (kind `client`), with `rpc.method`, `trpc.type` and `trpc.error.code` on failure. `httpLink` sends the span as `traceparent` and `b3` headers (`wsLink` and `experimental_messagePortLink` put them in each request message's `trace` field), and the server's `trpc.<path>` span joins the same trace ([Server tracing](../server/effect.md#tracing)):

```ts
import { NodeSdk } from '@effect/opentelemetry';

const program = client.post.byId
  .query({ id })
  .pipe(Effect.withSpan('page.load'));
await Effect.runPromise(program.pipe(Effect.provide(NodeSdk.layer(otel))));
```

With no tracer (the Promise client, or Effect's default), calls open no span and send no headers or `trace` fields, so they cost nothing and simple requests stay free of CORS preflights. `Effect.provideService(Tracer.DisablePropagation, true)` keeps the spans and drops the headers.

On Cloudflare, see [Workers Traces](../adapters/durable-objects.md#workers-traces).
