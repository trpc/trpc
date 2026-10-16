---
title: "Cloudflare Workers Traces Integration"
description: "Record oRPC procedure, middleware, and stream spans in Cloudflare Workers Traces through the Workers custom spans API, with no OpenTelemetry SDK."
sidebar:
  label: "Cloudflare Traces"
---

:::warning
This guide assumes familiarity with [Cloudflare Workers Traces](https://developers.cloudflare.com/workers/observability/traces/). Review the official documentation if needed.
:::

## Installation

```package-install
npm install @orpc/cloudflare@beta
```

## Setup

Enable traces in your Wrangler configuration, then register `CloudflareTracer` once at module scope. oRPC then records the same spans as the [OpenTelemetry integration](/docs/integrations/opentelemetry), nested under the spans Workers create automatically.

```jsonc title="wrangler.jsonc"
{
  "observability": {
    "traces": {
      "enabled": true
    }
  }
}
```

```ts
import { experimental_CloudflareTracer as CloudflareTracer } from '@orpc/cloudflare'

new CloudflareTracer().enable()
```

:::info
`CloudflareTracer` covers both handlers and links, so a Worker that calls another oRPC server also records client spans. oRPC uses a single tracer, so do not enable `ORPCInstrumentation` alongside it.
:::

:::tip
During local development, [Local Explorer](https://developers.cloudflare.com/workers/local-development/local-explorer/) shows these spans without deploying: press `e` in `wrangler dev`, or open `/cdn-cgi/local/explorer` on the Vite dev server.
:::

## Middleware Span

oRPC creates a span for each [middleware](/docs/middleware) execution. Use `tracing.getActiveSpan()` to add attributes to it:

```ts
import { tracing } from 'cloudflare:workers'

export const someMiddleware = os.middleware(async (ctx, next) => {
  tracing.getActiveSpan()?.setAttribute('someAttribute', 'someValue')

  return next()
})

Object.defineProperty(someMiddleware, 'name', {
  value: 'someName',
})
```

:::tip
Define the `name` property on your middleware to improve span naming and make traces easier to read.
:::

## Limitations

Workers Traces still lack some APIs oRPC relies on, so:

- Streamed inputs and outputs record no `yielded` and `enqueued` events.
- Trace context propagation is not configurable by oRPC.
