---
title: "Fetch API Adapter"
description: "Use oRPC with the Fetch API on both servers and clients, in runtimes such as Bun and Deno."
sidebar:
  label: "Fetch API"
---

## Server Usage

<CodeGroup>

```ts RPC
import { RPCHandler } from '@orpc/server/fetch'
import { CORSHandlerPlugin } from '@orpc/server/plugins'
import { onError } from '@orpc/server'

const handler = new RPCHandler(router, {
  plugins: [
    new CORSHandlerPlugin()
  ],
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

export async function fetch(request: Request): Promise<Response> {
  const { matched, response } = await handler.handle(request, {
    prefix: '/rpc',
    context: {} // Provide initial context if needed, can be an async function
  })

  if (matched) {
    return response
  }

  return new Response('Not found', { status: 404 })
}
```

```ts OpenAPI
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { CORSHandlerPlugin } from '@orpc/server/plugins'
import { onError } from '@orpc/server'

const handler = new OpenAPIHandler(router, {
  plugins: [
    new CORSHandlerPlugin()
  ],
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

export async function fetch(request: Request): Promise<Response> {
  const { matched, response } = await handler.handle(request, {
    prefix: '/api',
    context: {} // Provide initial context if needed, can be an async function
  })

  if (matched) {
    return response
  }

  return new Response('Not found', { status: 404 })
}
```

</CodeGroup>

:::info
The actual usage of `fetch` depends on the runtime environment or library you use:

<CodeGroup>

```ts Bun
Bun.serve({
  fetch,
})
```

```ts Deno
Deno.serve(fetch)
```

</CodeGroup>
:::

:::warning
To better support `Blob`, `File`, and `ReadableStream<Uint8Array>` at the root level in cross-origin scenarios,
extend your [CORS allowlist](https://developer.mozilla.org/en-US/docs/Glossary/CORS-safelisted_response_header) to allow clients to read the `Content-Disposition` and `Standard-Server` response headers. Learn more in the [Standard Server documentation](https://github.com/middleapi/standard-server#how-body-parsing-works). If you use the [CORS Plugin](/docs/plugins/cors), include them in `exposeHeaders`:

```ts
const cors = new CORSHandlerPlugin({
  exposeHeaders: ['Content-Disposition', 'Standard-Server'],
})
```

:::

## Client Usage

<CodeGroup>

```ts RPC
import { RPCLink } from '@orpc/client/fetch'
import { onError } from '@orpc/client'

const link = new RPCLink({
  origin: 'https://api.example.com', // accepts async function, defaults to current origin
  url: '/rpc', // accepts async function
  headers: { authorization: 'bearer token' }, // accept async function
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
  fetch: (request, init) => { // <- override fetch if needed
    return globalThis.fetch(request, {
      ...init,
      credentials: 'include', // Include cookies on cross-origin requests
    })
  },
})
```

```ts OpenAPI
import { OpenAPILink } from '@orpc/openapi/fetch'
import { onError } from '@orpc/client'

const link = new OpenAPILink(contract, {
  origin: 'https://api.example.com', // accepts async function, defaults to current origin
  url: '/rpc', // accepts async function
  headers: { authorization: 'bearer token' }, // accept async function
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
  fetch: (request, init) => { // <- override fetch if needed
    return globalThis.fetch(request, {
      ...init,
      credentials: 'include', // Include cookies on cross-origin requests
    })
  },
})
```

</CodeGroup>

:::info
The examples above only show how to configure the link. For examples of creating a typesafe client, see [RPC Link](/docs/rpc/link#typesafe-clients) and [OpenAPI Link](/docs/openapi/link#typesafe-clients).
:::

## Event Stream Options

You can configure how an [AsyncIteratorObject](/docs/async-iterator-object) is streamed to the client using the `toFetchResponse.eventStream` options when creating the handler.

```ts
const handler = new OpenAPIHandler(router, {
  toFetchResponse: {
    eventStream: {
      initialComment: {
        /**
         * If true, an initial comment is sent immediately upon stream start to flush headers.
         * This allows the receiving side to establish the connection without waiting for the first event.
         *
         * @default true
         */
        enabled: true,
        /**
         * The content of the initial comment sent upon stream start. Must not include newline characters.
         *
         * @default ''
         */
        comment: '',
      },
      keepAlive: {
        /**
         * If true, a ping comment is sent periodically to keep the connection alive.
         *
         * @default true
         */
        enabled: true,
        /**
         * Interval (in milliseconds) between ping comments sent after the last event.
         *
         * @default 15000
         */
        interval: 15000,
        /**
         * The content of the ping comment. Must not include newline characters.
         *
         * @default ''
         */
        comment: '',
      },
    },
  },
})
```

:::info
You can also configure how an [AsyncIteratorObject](/docs/async-iterator-object) is streamed from client to server using `toFetchRequest.eventStream` options when creating the link.
:::
