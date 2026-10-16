---
title: "OpenTelemetry Integration"
description: "Add automatic OpenTelemetry instrumentation to oRPC for distributed tracing and performance monitoring across client and server."
sidebar:
  label: "OpenTelemetry"
---

:::warning
This guide assumes familiarity with [OpenTelemetry](https://opentelemetry.io/). Review the official documentation if needed.
:::

![oRPC OpenTelemetry Integration Preview](/images/opentelemetry-integration-preview.png)

:::info
See the complete example in our [playgrounds](/docs/playgrounds).
:::

## Installation

```package-install
npm install @orpc/opentelemetry@beta
```

## Setup

To integrate OpenTelemetry with oRPC, use `ORPCInstrumentation`. It automatically instruments both client and server for distributed tracing.

<CodeGroup>

```ts server twoslash
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ORPCInstrumentation } from '@orpc/opentelemetry'

const sdk = new NodeSDK({
  instrumentations: [
    new ORPCInstrumentation(), // [!code highlight]
  ],
})

sdk.start()
```

```ts client twoslash
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { ORPCInstrumentation } from '@orpc/opentelemetry'

const provider = new WebTracerProvider()

provider.register()

registerInstrumentations({
  instrumentations: [
    new ORPCInstrumentation(), // [!code highlight]
  ],
})
```

</CodeGroup>

:::info
You can configure OpenTelemetry for your server, client, or both, depending on your needs.
:::

:::tip
On Cloudflare Workers, the [Cloudflare Workers Traces integration](/docs/integrations/cloudflare-traces) records the same spans without an OpenTelemetry SDK.
:::

## Context Propagation

By default, `ORPCInstrumentation` enables [context propagation](https://opentelemetry.io/docs/concepts/context-propagation/) between the client and server. You can disable it by setting `propagationEnabled` to `false` if you do not need it or if another instrumentation already handles it.

```ts
const instrumentation = new ORPCInstrumentation({
  propagationEnabled: false,
})
```

:::warning
Popular instrumentations that already handle context propagation include [@hono/otel](https://www.npmjs.com/package/@hono/otel), [@opentelemetry/instrumentation-http](https://www.npmjs.com/package/@opentelemetry/instrumentation-http), and [@opentelemetry/instrumentation-fetch](https://www.npmjs.com/package/@opentelemetry/instrumentation-fetch).
:::

## Middleware Span

oRPC automatically creates spans for each [middleware](/docs/middleware) execution. You can access the active span to customize attributes, events, and other span data:

```ts
import { trace } from '@opentelemetry/api'

export const someMiddleware = os.middleware(async (ctx, next) => {
  const span = trace.getActiveSpan()

  span?.setAttribute('someAttribute', 'someValue')
  span?.addEvent('someEvent')

  return next()
})

Object.defineProperty(someMiddleware, 'name', {
  value: 'someName',
})
```

:::tip
Define the `name` property on your middleware to improve span naming and make traces easier to read.
:::

## Capture Abort Signals

If your application heavily uses [AsyncIteratorObject](/docs/async-iterator-object) or similar streaming patterns, we recommend capturing an event when the `signal` is aborted to properly track and detach unexpected long-running operations:

```ts
import { trace } from '@opentelemetry/api'

const handler = new RPCHandler(router, {
  interceptors: [
    ({ request, next }) => {
      const span = trace.getActiveSpan()

      request.signal?.addEventListener('abort', () => {
        span?.addEvent('aborted', { reason: String(request.signal?.reason) })
      })

      return next()
    },
  ],
})
```
