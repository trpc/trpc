---
title: "Timeout Plugin"
description: "Abort requests that exceed a timeout on the client or the server, using a static value or a per-request dynamic timeout."
sidebar:
  label: "Timeout"
---

## Client

Use `TimeoutLinkPlugin` to abort requests that exceed the timeout with an `AbortError`:

```ts
import { TimeoutLinkPlugin } from '@orpc/client/plugins'

const link = new RPCLink({
  plugins: [
    new TimeoutLinkPlugin({
      timeout: 10_000, // 10 seconds
    }),
  ],
})
```

:::info
The `link` can be any supported oRPC link, such as [RPCLink](/docs/rpc/link), [OpenAPILink](/docs/openapi/link), or a custom one.
:::

## Server

Use `TimeoutHandlerPlugin` to abort the request signal with an `AbortError` when handling exceeds the timeout:

```ts handler
import { TimeoutHandlerPlugin } from '@orpc/server/plugins'

const handler = new RPCHandler(router, {
  plugins: [
    new TimeoutHandlerPlugin({
      timeout: 10_000, // 10 seconds
    }),
  ],
})
```

:::warning
The plugin only aborts the request signal, it does not respond right after the timeout exceeds. The procedure must honor the signal to stop early and produce the response.
:::

### Streaming Responses

The `timeout` option only covers producing the response, so streaming responses can outlive it. Use `streamingTimeout`, usually higher, to limit the full duration of streaming response bodies ([async iterator objects](/docs/async-iterator-object) and readable streams):

```ts handler
const handler = new RPCHandler(router, {
  plugins: [
    new TimeoutHandlerPlugin({
      timeout: 10_000, // 10 seconds to produce the response
      streamingTimeout: 300_000, // 5 minutes for the full stream
    }),
  ],
})
```

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or a custom one.
:::

## Dynamic Timeout

The `timeout` and `streamingTimeout` options also accept a function, so you can resolve the timeout per request from the interceptor options. On the client these include the procedure `path` and the [client context](/docs/client/client-side#client-context), on the server the matched `procedure` and the [handler context](/docs/context):

<CodeGroup>

```ts link
const link = new RPCLink({
  plugins: [
    new TimeoutLinkPlugin({
      timeout: ({ context, path }) => context.timeout ?? 10_000,
    }),
  ],
})
```

```ts handler
const handler = new RPCHandler(router, {
  plugins: [
    new TimeoutHandlerPlugin({
      timeout: ({ path }) => path[0] === 'reports' ? 60_000 : 10_000,
    }),
  ],
})
```

</CodeGroup>

:::info
Return `null` or `undefined` to disable the timeout, which is useful for excluding long-lived requests. Any number always enables the timeout.
:::

## Learn More

For implementation details, see the [TimeoutLinkPlugin source code](https://github.com/middleapi/orpc/blob/main/packages/client/src/plugins/timeout.ts) or the [TimeoutHandlerPlugin source code](https://github.com/middleapi/orpc/blob/main/packages/server/src/plugins/timeout.ts).
