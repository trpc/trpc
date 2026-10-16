---
title: "Evlog Integration"
description: "Add structured logging to oRPC with the Evlog integration to trace requests, monitor errors, and inspect application behavior."
sidebar:
  label: "Evlog"
---

:::warning
This guide assumes familiarity with [Evlog](https://evlog.dev/). Review the official documentation if needed.
:::

## Installation

```package-install
npm install @orpc/evlog@beta evlog@beta
```

## Setup

Use `EvlogHandlerPlugin` to instrument your handler with structured logs, request tracking, and error monitoring.

```ts twoslash
import { RPCHandler } from '@orpc/server/fetch'
import { router } from './shared/planet'
// ---cut---
import { EvlogHandlerPlugin } from '@orpc/evlog'

const handler = new RPCHandler(router, {
  plugins: [
    new EvlogHandlerPlugin({
      drain: undefined, // <- custom Evlog drain (optional)
      plugins: [], // <- additional Evlog plugins (optional)
      logAbort: true, // <- log when requests are aborted (disabled by default)
    }),
  ],
})
```

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or a custom one.
:::

## Error Logging Levels

Errors thrown from your procedures set the wide event's level to match their intent: `info` for abort errors, `warn` for `ORPCError` instances since they represent deliberate rejections, and `error` for everything else, including `ORPCError` with the `INTERNAL_SERVER_ERROR` code. Use the `procedureErrorLevel` option to customize this behavior:

```ts
const plugin = new EvlogHandlerPlugin({
  procedureErrorLevel: (error, level) => {
    if (level === 'error' && error instanceof ExpectedError) {
      return 'warn'
    }

    return level
  },
})
```

## Using the Logger in Your Code

This plugin supports using [AsyncLocalStorage](https://nodejs.org/api/async_context.html#class-asynclocalstorage) to access the logger throughout a request and enrich the final [wide event](https://www.evlog.dev/learn/wide-events#uselogger-retrieving-the-request-logger). It is the most convenient way to use Evlog's full feature set. If your runtime does not support AsyncLocalStorage, you can still [access the logger from the context](#without-asynclocalstorage).

<CodeGroup>

```ts title="business logic"
import { createLoggerStorage } from '@orpc/evlog/node'

/**
 * Pass `storage` to the plugin configuration.
 * Call `useLogger` inside a procedure to access the request logger.
 */
export const { storage, useLogger } = createLoggerStorage()

const procedure = os
  .handler(async () => {
    const logger = useLogger() // [!code highlight]

    logger?.set({ user: { id: 123, name: 'John Doe' } }) // [!code highlight]

    await logger.fork('child-procedure', () => {
      const logger = useLogger() // [!code highlight]
    })

    return { success: true }
  })
```

```ts title="handler setup"
const handler = new RPCHandler(router, {
  plugins: [
    new EvlogHandlerPlugin({
      storage, // <- pass the storage to the plugin
    }),
  ],
})
```

</CodeGroup>

### Without AsyncLocalStorage

If you do not want to use AsyncLocalStorage, or your runtime does not support it, you can still read the logger from the context.

```ts
import { getLogger, LoggerContext } from '@orpc/evlog'

interface ServerContext extends LoggerContext {} // [!code highlight]

const procedure = os
  .$context<ServerContext>()
  .handler(({ context }) => {
    const logger = getLogger(context) // [!code highlight]

    logger?.set({ user: { id: 123, name: 'John Doe' } }) // [!code highlight]

    return { success: true }
  })
```
