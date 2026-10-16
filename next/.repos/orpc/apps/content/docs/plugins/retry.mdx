---
title: "Retry Plugin"
description: "Automatically retry failed oRPC requests with customizable strategies controlled through client context options."
sidebar:
  label: "Retry"
---

:::warning
Before using this plugin, make sure you understand [client context](/docs/client/client-side#client-context), as retry behavior is managed through context.
:::

## Setup

```ts
import { RetryLinkPlugin, RetryLinkPluginContext } from '@orpc/client/plugins'

interface ClientContext extends RetryLinkPluginContext {}

const link = new RPCLink<ClientContext>({
  plugins: [
    new RetryLinkPlugin(),
  ],
})
```

:::info
The `link` can be any supported oRPC link, such as [RPCLink](/docs/rpc/link), [OpenAPILink](/docs/openapi/link), or a custom one.
:::

## Usage

By default, retries are disabled. To enable retries, set the `retry` count in the request context:

```ts twoslash
import { router } from './shared/planet'
import { RetryLinkPluginContext } from '@orpc/client/plugins'
import { RouterClient } from '@orpc/server'

declare const client: RouterClient<typeof router, RetryLinkPluginContext>
// ---cut---
const planets = await client.planet.list({ limit: 10 }, {
  context: {
    retry: 3, // Maximum retry attempts
    retryDelay: 2000, // Delay between retries in ms
    shouldRetry: options => true, // Determines whether to retry based on the error
    onRetry: (options) => {
      // Hook executed on each retry

      return (isSuccess) => {
        // Execute after the retry is complete
      }
    },
  }
})
```

:::info
The following context options control retry behavior:

- **retry:** Maximum number of retry attempts before throwing an error _(default: `0`)_.
- **retryDelay:** Delay between retry attempts _(default: `(o) => o.lastEventRetry ?? 2000`)_.
- **shouldRetry:** Function that determines whether a retry should be attempted _(default: `true`)_.

You can override the default retry behavior globally by passing `default` options when initializing the plugin:

```ts
const link = new RPCLink<ClientContext>({
  plugins: [
    new RetryLinkPlugin({
      default: {
        retry: 0,
        retryDelay: o => o.lastEventRetry ?? 2000,
        shouldRetry: o => true,
      }
    }),
  ],
})
```

:::

## Event Source Simulation

To replicate the behavior of [EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) for an [AsyncIteratorObject](/docs/async-iterator-object), use the following configuration:

```ts
const streaming = await client.streaming('the input', {
  context: {
    retry: Number.POSITIVE_INFINITY,
  }
})

for await (const message of streaming) {
  console.log(message)
}
```

## Learn More

For implementation details, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/client/src/plugins/retry.ts).
