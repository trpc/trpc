---
title: "DynamicLink"
description: "Use DynamicLink to choose a link at runtime and route different oRPC requests through different links based on client context."
sidebar:
  label: "Dynamic Link"
---

## Example

```ts twoslash
import { os, RouterClient } from '@orpc/server'
import { RPCLink } from '@orpc/client/fetch'

const router = {
  ping: os.handler(() => 'pong'),
  pong: os.handler(() => 'ping'),
}
// ---cut---
import { createORPCClient, DynamicLink } from '@orpc/client'

interface ClientContext {
  cache?: boolean
}

const cacheLink = new RPCLink({
  origin: 'https://cache.example.com',
})

const noCacheLink = new RPCLink({
  origin: 'https://example.com',
})

const link = new DynamicLink<ClientContext>((options, path, input) => {
  if (options.context?.cache) {
    return cacheLink
  }

  return noCacheLink
})

const client: RouterClient<typeof router, ClientContext> = createORPCClient(link)
```

:::info
This example uses two [RPC Link](/docs/rpc/link) instances, but `DynamicLink` works with any other link.
:::
