---
title: "React Router Adapter"
description: "Use oRPC inside a React Router project by mounting a handler in a resource route."
sidebar:
  label: "React Router"
---

[React Router](https://reactrouter.com/) is a multi-strategy router for React, and the successor to [Remix](https://remix.run/). In framework mode, its resource routes follow the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), so oRPC integrates through the [Fetch API Adapter](/docs/adapters/fetch-api).

## Basic

<CodeGroup>

```ts title="app/routes/rpc.ts"
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

async function handleRequest(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: '/rpc',
    context: {} // Provide initial context if needed, can be an async function
  })

  return response ?? new Response('Not found', { status: 404 })
}

export async function loader({ request }: LoaderFunctionArgs) {
  return handleRequest(request)
}

export async function action({ request }: ActionFunctionArgs) {
  return handleRequest(request)
}
```

```ts title="app/routes.ts"
import type { RouteConfig } from '@react-router/dev/routes'
import { index, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('rpc/*', 'routes/rpc.ts'),
] satisfies RouteConfig
```

</CodeGroup>

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or another custom handler.
:::

:::info
In a Remix v2 project, the same `loader` and `action` exports work in a splat route (`app/routes/rpc.$.ts`) with the types imported from `@remix-run/node`.
:::
