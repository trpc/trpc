---
title: "Server-Side Clients"
description: "Call oRPC procedures locally in the same process with call, createRouterClient, or the callable extension, ideal for server-side code."
sidebar:
  label: "Server-Side"
---

## One-Off Calls

Use `call` when you need to invoke a single procedure without creating a client instance.

```ts twoslash
import * as z from 'zod'

const exampleProcedure = os
  .input(z.string())
  .handler(async ({ input }) => ({ id: input }))
// ---cut---
import { call, os } from '@orpc/server'

const result = await call(exampleProcedure, 'input', {
  context: {} // <- provide initial context if needed
})
```

## Router Clients

Use `createRouterClient` to create a client for your [router](/docs/router). This is useful when you want to call multiple procedures.

```ts twoslash
import * as z from 'zod'
import { os } from '@orpc/server'

const router = {
  ping: os.handler(() => 'pong'),
  pong: os.handler(() => 'ping'),
}
// ---cut---
import { createRouterClient } from '@orpc/server'

const client = createRouterClient(router, {
  context: {}, // <- provide initial context if needed, can be async function
  interceptors: [
    async ({ next, path }) => {
      console.time(path.join('.'))

      try {
        return await next()
      }
      catch (err) {
        console.error(`${path.join('.')}:`, err)
        throw err
      }
      finally {
        console.timeEnd(path.join('.'))
      }
    }
  ]
})

const result = await client.ping()
```

### Client Context

Client context is passed with each call. Use it to switch between contexts, such as different users or tenants, without creating multiple client instances.

```ts twoslash
import * as z from 'zod'
import { createRouterClient, os } from '@orpc/server'

const router = {
  ping: os.handler(() => 'pong'),
  pong: os.handler(() => 'ping'),
}
// ---cut---
interface ClientContext {
  cache?: boolean
}

const client = createRouterClient(router, {
  context: ({ cache }: ClientContext) => { // [!code highlight]
    if (cache) {
      return {} // <- context when cache enabled
    }

    return {}
  }
})

const result = await client.ping(undefined, { context: { cache: true } })
```

### Interceptors

Interceptors let you observe or modify an entire call. Common use cases include logging, error handling, and metrics collection.

```ts
const client = createRouterClient(router, {
  interceptors: [
    async ({ next, path, context }) => {
      console.time(path.join('.'))

      try {
        const output = await next()
        return output
      }
      catch (err) {
        console.error(`${path.join('.')}:`, err)
        throw err
      }
      finally {
        console.timeEnd(path.join('.'))
      }
    }
  ]
})
```

## `.callable` extension

Import `@orpc/server/extensions/callable` from a module that always runs during initialization, such as the file where you define your base builder or create your server. This adds a `.callable` method to the decorated procedure, allowing you to call it directly like a regular function while still using it as a regular procedure.

<CodeGroup>

```ts usage
const ping = base
  .input(z.object({ name: z.string(), }))
  .handler(async ({ input }) => `Hello ${input.name}!`)
  .callable({
    context: async () => ({}), // <- provide initial context if needed, can be async function
    interceptors: [], // <- client interceptors
  })

const router = {
  ping, // <- still use it as a regular procedure
}

const message = await ping({ name: 'World' }) // <- or call it directly
```

```ts setup
import '@orpc/server/extensions/callable'

import { os } from '@orpc/server'

export const base = os
```

</CodeGroup>

## Lifecycle

The diagram below shows how a call flows through a server-side client. By default, middlewares registered before `.input` run before input validation, and the rest run after it:

```mermaid
sequenceDiagram
  actor Caller
  participant Validator as Input/Output Validator
  participant Handler

  Caller ->> Validator: input, signal, lastEventId, ...
  Note over Validator: interceptors
  Note over Validator: middlewares registered before .input
  Validator ->> Validator: validate input
  Validator -->> Caller: if invalid input
  Note over Validator: middlewares registered after .input
  Validator ->> Handler: validated input
  Handler ->> Handler: execute handler
  Handler ->> Validator: output or error
  Validator ->> Validator: validate output
  Validator ->> Caller: output or error
```
