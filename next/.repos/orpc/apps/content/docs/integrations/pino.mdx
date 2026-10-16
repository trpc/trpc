---
title: "Pino Integration"
description: "Add structured logging to oRPC with the Pino integration to track requests, monitor errors, and gain insight into application behavior."
sidebar:
  label: "Pino"
---

:::warning
This guide assumes familiarity with [Pino](https://getpino.io/). Review the official documentation if needed.
:::

## Installation

```package-install
npm install @orpc/pino@beta pino@beta
```

## Setup

To set up Pino with oRPC, use the `PinoHandlerPlugin` class. This plugin automatically instruments your handler with structured logging, request tracking, and error monitoring.

```ts twoslash
import { RPCHandler } from '@orpc/server/fetch'
import { router } from './shared/planet'
// ---cut---
import { PinoHandlerPlugin } from '@orpc/pino'
import pino from 'pino'

const logger = pino()

const handler = new RPCHandler(router, {
  plugins: [
    new PinoHandlerPlugin({
      logger, // <- custom logger instance
      generateRequestId: ({ request }) => crypto.randomUUID(), // <- custom request id generator
      logLifecycle: true, // <- log information about request lifecycle (disabled by default)
      logAbort: true, // <- log information when requests are aborted (disabled by default)
    }),
  ],
})
```

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or a custom one.
:::

:::tip
For improved log readability during development, consider using [pino-pretty](https://github.com/pinojs/pino-pretty) to format your logs in a human-friendly way.

```bash
npm run dev | npx pino-pretty
```

:::

## Error Logging Levels

Errors thrown from your procedures are logged at a level matching their intent: `info` for abort errors, `warn` for `ORPCError` instances since they represent deliberate rejections, and `error` for everything else, including `ORPCError` with the `INTERNAL_SERVER_ERROR` code. Use the `procedureErrorLevel` option to customize this behavior:

```ts
const plugin = new PinoHandlerPlugin({
  procedureErrorLevel: (error, level) => {
    if (level === 'error' && error instanceof ExpectedError) {
      return 'warn'
    }

    return level
  },
})
```

## Using the Logger in Your Code

You can access the logger from the context object using the `getLogger` function:

```ts
import { getLogger, LoggerContext } from '@orpc/pino'

interface ServerContext extends LoggerContext {} // [!code highlight]

const procedure = os
  .$context<ServerContext>()
  .handler(({ context }) => {
    const logger = getLogger(context) // [!code highlight]

    logger?.info('Processing request')
    logger?.debug({ userId: 123 }, 'User data')

    return { success: true }
  })
```

## Providing Custom Logger per Request

You can provide a custom logger instance for specific requests by passing it through the context. This is especially useful when integrating with [pino-http](https://github.com/pinojs/pino-http) for enhanced HTTP logging:

```ts
import {
  LOGGER_CONTEXT_SYMBOL,
  LoggerContext,
  PinoHandlerPlugin
} from '@orpc/pino'

const logger = pino()
const httpLogger = pinoHttp({ logger })

interface ServerContext extends LoggerContext {} // [!code highlight]

const router = {
  ping: os.$context<ServerContext>().handler(() => 'pong')
}

const handler = new RPCHandler(router, {
  plugins: [
    new PinoHandlerPlugin({ logger }), // [!code highlight]
  ],
})

const server = createServer(async (req, res) => {
  httpLogger(req, res)

  const { matched } = await handler.handle(req, res, {
    prefix: '/api',
    context: {
      [LOGGER_CONTEXT_SYMBOL]: req.log, // [!code highlight]
    },
  })

  if (!matched) {
    res.statusCode = 404
    res.end('Not Found')
  }
})
```
