---
title: "AWS Lambda Adapter"
description: "Use oRPC on AWS Lambda behind API Gateway (payload formats 1.0 and 2.0) and Lambda Function URLs using response streaming."
sidebar:
  label: "AWS Lambda"
---

:::warning
This adapter requires the Lambda Node.js runtime with [response streaming](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html) enabled, so handlers must be wrapped with `awslambda.streamifyResponse`.
:::

## Server Usage

<CodeGroup>

```ts RPC
import type { APIGatewayProxyEventV2, AwsLambdaGlobal } from '@standard-server/aws-lambda'
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/aws-lambda'
import { CORSHandlerPlugin } from '@orpc/server/plugins'

declare const awslambda: AwsLambdaGlobal

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

export const rpc = awslambda.streamifyResponse<APIGatewayProxyEventV2>(async (event, responseStream, context) => {
  const { matched } = await handler.handle(event, responseStream, {
    prefix: '/rpc',
    context: {} // Provide initial context if needed, can be an async function
  })

  if (matched) {
    return
  }

  awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 404,
    headers: {},
    cookies: [],
  }).end('Not found')
})
```

```ts OpenAPI
import type { APIGatewayProxyEventV2, AwsLambdaGlobal } from '@standard-server/aws-lambda'
import { OpenAPIHandler } from '@orpc/openapi/aws-lambda'
import { onError } from '@orpc/server'
import { CORSHandlerPlugin } from '@orpc/server/plugins'

declare const awslambda: AwsLambdaGlobal

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

export const api = awslambda.streamifyResponse<APIGatewayProxyEventV2>(async (event, responseStream, context) => {
  const { matched } = await handler.handle(event, responseStream, {
    prefix: '/api',
    context: {} // Provide initial context if needed, can be an async function
  })

  if (matched) {
    return
  }

  awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 404,
    headers: {},
    cookies: [],
  }).end('Not found')
})
```

</CodeGroup>

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
