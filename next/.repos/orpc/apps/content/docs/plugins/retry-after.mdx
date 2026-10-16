---
title: "Retry After Plugin"
description: "Automatically retry requests based on the Retry-After response header, useful for rate limits and temporary server unavailability."
sidebar:
  label: "Retry After"
---

## Usage

```ts
import { RetryAfterLinkPlugin } from '@orpc/client/plugins'

const link = new RPCLink({
  plugins: [
    new RetryAfterLinkPlugin(),
  ],
})
```

:::info
The `link` can be any supported oRPC link, such as [RPCLink](/docs/rpc/link), [OpenAPILink](/docs/openapi/link), or a custom one.
:::

:::warning
Requests whose body is a [`ReadableStream`](/docs/binary-data#readablestreamuint8array) or an [`AsyncIteratorObject`](/docs/async-iterator-object) are never retried. The first attempt consumes the body, so it cannot be resent, and the plugin returns the first response as-is.
:::

## Options

By default, the plugin retries only requests that receive a `429` (Too Many Requests) or `503` (Service Unavailable) status code. It times out after 5 minutes and allows up to 3 retry attempts. You can customize this behavior with the following options:

```ts
const link = new RPCLink({
  plugins: [
    new RetryAfterLinkPlugin({
      condition: response => [429, 503].includes(response.status),
      timeout: 5 * 60 * 1000, // 5 minutes
      maxAttempts: 3,
    }),
  ],
})
```

## Learn More

For implementation details, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/client/src/plugins/retry-after.ts).
