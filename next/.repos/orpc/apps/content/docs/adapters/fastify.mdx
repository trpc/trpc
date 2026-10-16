---
title: "Fastify Adapter"
description: "Use oRPC with Fastify servers via RPCHandler or OpenAPIHandler, with content type parser tips and event stream options."
sidebar:
  label: "Fastify"
---

## Server Usage

<CodeGroup>

```ts RPC
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fastify'
import { CORSHandlerPlugin } from '@orpc/server/plugins'
import Fastify from 'fastify'

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

const app = Fastify()

app.all('/rpc/*', async (req, reply) => {
  const { matched } = await handler.handle(req, reply, {
    prefix: '/rpc',
    context: {} // Provide initial context if needed, can be an async function
  })

  if (matched) {
    return reply
  }

  return reply.status(404).send('Not found')
})

app.listen({ port: 3000 }).then(() => console.log('Listening on port 3000'))
```

```ts OpenAPI
import { OpenAPIHandler } from '@orpc/openapi/fastify'
import { onError } from '@orpc/server'
import { CORSHandlerPlugin } from '@orpc/server/plugins'
import Fastify from 'fastify'

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

const app = Fastify()

app.all('/api/*', async (req, reply) => {
  const { matched } = await handler.handle(req, reply, {
    prefix: '/api',
    context: {} // Provide initial context if needed, can be an async function
  })

  if (matched) {
    return reply
  }

  return reply.status(404).send('Not found')
})

app.listen({ port: 3000 }).then(() => console.log('Listening on port 3000'))
```

</CodeGroup>

:::tip
Fastify only accepts content types it has a registered parser for, and parses request bodies itself. Registering a catch-all parser lets oRPC handle every content type, but bodies it receives skip Fastify's [`bodyLimit`](https://fastify.dev/docs/latest/Reference/Server/#bodylimit), so cap them with [Request Limit](/docs/plugins/request-limit) or [Tmp File Upload](/docs/plugins/tmp-file-upload):

```ts
// Optional, let oRPC parse all content types
app.removeAllContentTypeParsers()

// Optional, support all content types
app.addContentTypeParser('*', (request, payload, done) => {
  done(null, undefined)
})
```

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

## Event Stream Options

You can configure how an [AsyncIteratorObject](/docs/async-iterator-object) is streamed to the client using the `sendStandardResponse.eventStream` options when creating the handler.

```ts
const handler = new OpenAPIHandler(router, {
  sendStandardResponse: {
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
