---
title: "Getting Started"
description: "Build your first end-to-end typesafe API with oRPC, from defining procedures to serving and calling them from a client."
sidebar:
  icon: rocket
---

Building an API usually means defining HTTP endpoints on the server, calling them from the client, and keeping both sides' types in sync by hand. oRPC removes that gap: you write plain TypeScript functions on the server, and clients call them like local functions. Input is validated at runtime, types flow end to end, and there is no code generation step.

This guide takes the shortest path through oRPC:

1. Define procedures (the functions of your API) and group them into a router.
2. Serve the router over HTTP.
3. Call it from a fully typed client.

:::tip[Prefer a running example?]
Open one of the [playgrounds](/docs/playgrounds) in StackBlitz and follow along in a complete project.
:::

## Installation

Install the server and client packages, plus a schema library for validating input at runtime. This guide uses [Zod](https://zod.dev/), but [Valibot](https://valibot.dev/), [ArkType](https://arktype.io/), and any other [Standard Schema](https://standardschema.dev/) library work the same way.

```package-install
npm install @orpc/server@beta @orpc/client@beta zod
```

## Define a Router

A procedure is a function that clients can call remotely. Build one with the `os` builder (short for oRPC server): optionally describe the input it accepts with a schema, then implement it with `.handler`. A router is a plain object that groups procedures and gives each one its calling path, like `planet.list`.

```ts twoslash
import { os } from '@orpc/server'
import * as z from 'zod'

export const listPlanets = os
  .handler(async () => {
    // replace with your database query
    return [
      { id: 1, name: 'Earth' },
      { id: 2, name: 'Mars' },
    ]
  })

export const findPlanet = os
  .input(z.object({ id: z.number() }))
  .handler(async ({ input }) => {
    // replace with your database query
    return { id: input.id, name: 'Earth' }
  })

export const createPlanet = os
  .input(z.object({ name: z.string(), description: z.string().optional() }))
  .handler(async ({ input }) => {
    // replace with your database insert
    return { id: 3, ...input }
  })

export const router = {
  planet: {
    list: listPlanets,
    find: findPlanet,
    create: createPlanet,
  },
}
```

A few things to notice:

- `.input` validates each call before your handler runs and types `input` inside it. `listPlanets` skips it: a procedure without `.input` simply takes no arguments.
- No `.output` schema is needed: the client's result type flows straight from the handler's return type.
- Procedures can do much more: share [middleware](/docs/middleware), require [context](/docs/context) such as an authenticated user, and declare typed [errors](/docs/error-handling). Learn more in the [Procedure documentation](/docs/procedure).

## Create a Server

Clients reach your router through an HTTP server. `RPCHandler` does the translation: it matches each incoming request to a procedure, validates the input, runs your handler, and sends the result back. This example uses [Node's built-in HTTP module](/docs/adapters/node-http). The same router also runs on Bun and Deno through the [Fetch API adapter](/docs/adapters/fetch-api), and on [Cloudflare Workers](/docs/adapters/cloudflare-workers).

```ts twoslash
/// <reference types="node" />
import { router } from './shared/getting-started'
// ---cut---
import { createServer } from 'node:http'
import { RPCHandler } from '@orpc/server/node'

const handler = new RPCHandler(router)

const server = createServer(async (req, res) => {
  const { matched } = await handler.handle(req, res, { prefix: '/rpc' })

  if (matched) {
    return
  }

  res.statusCode = 404
  res.end('Not found')
})

server.listen(3000, '127.0.0.1', () => console.log('Listening on 127.0.0.1:3000'))
```

Every procedure is now reachable under the `/rpc` prefix. Requests that are not oRPC calls fall through, so you can handle them yourself, here with a plain 404. For CORS, logging, and other options, see the [RPC Handler documentation](/docs/rpc/handler).

:::info
oRPC can also serve the same router as a REST API. Add [routing metadata](/docs/openapi/routing) to your procedures, serve them with the [OpenAPI Handler](/docs/openapi/handler), and generate an [OpenAPI specification](/docs/openapi/specification) from the same definitions.
:::

## Create a Client

On the client, `RPCLink` is the counterpart of `RPCHandler`: it turns your function calls into HTTP requests. Pass it to `createORPCClient`, and type the result with `RouterClient<typeof router>` so the client knows every procedure, its input, and its output.

```ts twoslash
import type { router } from './shared/getting-started'
// ---cut---
import type { RouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

const link = new RPCLink({
  origin: 'http://127.0.0.1:3000',
  url: '/rpc', // <- must match the server's prefix
})

export const orpc: RouterClient<typeof router> = createORPCClient(link)
```

:::tip
The client only needs the router's type. Import it with `import type`, or export the `RouterClient<typeof router>` type from the server, so no server code ends up in your client bundle. Learn more in the [Client-Side Clients documentation](/docs/client/client-side).
:::

When the caller runs in the same process as the server, for example during server-side rendering, skip HTTP entirely with a [server-side client](/docs/client/server-side).

## Call a Procedure

That is the whole setup. Call your procedures like local functions and let your editor do the rest:

```ts twoslash
import { client as orpc } from './shared/getting-started'
// ---cut---
const planets = await orpc.planet.list()

const planet = await orpc.planet.find({ id: 1 })

orpc.planet.create
//          ^|

//

//
```

`planet` is typed from the handler's return value, invalid input is rejected before your handler runs, and renaming a procedure on the server is a compile error in the client. There is no generated code to keep in sync.

## Next Steps

- Learn the building blocks in depth: [Procedure](/docs/procedure) and [Router](/docs/router)
- Add authentication and logging with [Middleware](/docs/middleware) and [Context](/docs/context), and reject calls with typed [errors](/docs/error-handling)
- Stream typed events over Server-Sent Events (SSE) with [AsyncIteratorObject](/docs/async-iterator-object)
- Expose the same router as a REST API with the [OpenAPI Handler](/docs/openapi/handler) and generate its [OpenAPI specification](/docs/openapi/specification)
- Define your API as a [contract first](/docs/contract-first), then let TypeScript enforce the implementation
- Integrate with your stack: [TanStack Query](/docs/integrations/tanstack-query), [SWR](/docs/integrations/swr), [Pinia Colada](/docs/integrations/pinia-colada), [Next.js](/docs/integrations/next), and [NestJS](/docs/integrations/nest)
