---
title: "Nuxt Adapter"
description: "Use oRPC inside a Nuxt project by mounting a handler in a server route."
sidebar:
  label: "Nuxt"
---

[Nuxt](https://nuxt.com/) is a popular Vue.js framework for building server-side applications. Its server engine follows web standards, so oRPC integrates through the [Fetch API Adapter](/docs/adapters/fetch-api).

## Server

You set up an oRPC server inside Nuxt using its [Server Routes](https://nuxt.com/docs/guide/directory-structure/server#server-routes).

<CodeGroup>

```ts title="server/routes/rpc/[...].ts"
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event)

  const { response } = await handler.handle(request, {
    prefix: '/rpc',
    context: {} // Provide initial context if needed, can be an async function
  })

  if (response) {
    return response
  }

  setResponseStatus(event, 404, 'Not Found')
  return 'Not found'
})
```

```ts title="server/routes/rpc/index.ts"
export { default } from './[...]'
```

</CodeGroup>

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or another custom handler.
:::

## Client

To make the oRPC client compatible with SSR, set it up inside a [Nuxt Plugin](https://nuxt.com/docs/guide/directory-structure/plugins).

```ts title="app/plugins/orpc.ts"
import type { RouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

export default defineNuxtPlugin(() => {
  const event = useRequestEvent()
  const requestURL = useRequestURL()

  const link = new RPCLink({
    url: '/rpc',
    origin: typeof window === 'undefined' ? requestURL.origin : undefined, // defaults to the current origin in the browser
    headers: () => event?.headers ?? {},
  })

  const client: RouterClient<typeof router> = createORPCClient(link)

  return {
    provide: {
      client,
    },
  }
})
```

:::info
The examples above only show how to configure the link. For examples of creating a typesafe client, see [RPC Link](/docs/rpc/link#typesafe-clients) and [OpenAPI Link](/docs/openapi/link#typesafe-clients).
:::

## Optimize SSR

To reduce HTTP requests and improve latency during SSR, you can use a [server-side client](/docs/client/server-side) during SSR. Below is a quick setup, see [Optimizing SSR](/docs/recipes/optimizing-ssr) for more details.

<CodeGroup>

```ts title="app/plugins/orpc.client.ts"
import type { RouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

export default defineNuxtPlugin(() => {
  const link = new RPCLink({
    url: '/rpc',
  })

  const client: RouterClient<typeof router> = createORPCClient(link)

  return {
    provide: {
      client,
    },
  }
})
```

```ts title="app/plugins/orpc.server.ts"
import { createRouterClient } from '@orpc/server'

export default defineNuxtPlugin(() => {
  const event = useRequestEvent()

  const client = createRouterClient(router, {
    context: {
      headers: event?.headers, // provide headers if initial context required
    },
  })

  return {
    provide: {
      client,
    },
  }
})
```

</CodeGroup>
