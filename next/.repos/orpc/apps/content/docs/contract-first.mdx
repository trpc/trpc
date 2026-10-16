---
title: "Contract-First"
description: "Build your first contract-first API with oRPC: describe the API in a contract, implement it with full type checking, and call it from a client that only needs the contract."
sidebar:
  icon: handshake
---

In the [Getting Started](/docs/getting-started) guide, each procedure is defined and implemented in one place, and the client's types come from the server's code. Contract-first splits this into two steps. First you write a **contract**: a description of every procedure, its input, and its output, with no logic inside. Then you implement the contract, and TypeScript checks that the implementation matches it exactly.

This is worth the extra step when:

- You want to agree on the API design before writing code, so frontend and backend work can start at the same time.
- The client lives in another repository or team, and it should depend on the API's shape, not on server code.
- You want one source of truth the implementation can never drift away from.

This guide follows the same path as Getting Started, in contract-first order:

1. Define a contract that describes your API.
2. Implement the contract on the server and serve it over HTTP.
3. Call it from a fully typed client built from the contract alone.

## Installation

Contract-first adds one package to the usual setup: `@orpc/contract`, which holds the contract builder. As before, you also need a schema library such as [Zod](https://zod.dev/), [Valibot](https://valibot.dev/), [ArkType](https://arktype.io/), or any other [Standard Schema](https://standardschema.dev/) library.

```package-install
npm install @orpc/contract@beta @orpc/server@beta @orpc/client@beta zod
```

## Define a Contract

A contract describes a procedure without implementing it. Build one with the `oc` builder (short for oRPC contract): declare the input with `.input`, the output with `.output`, and stop there. A contract has no `.handler`. Group contracts into a plain object, just like procedures form a router.

```ts twoslash
import { oc } from '@orpc/contract'
import * as z from 'zod'

const PlanetSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().optional(),
})

export const listPlanetsContract = oc
  .output(z.array(PlanetSchema))

export const findPlanetContract = oc
  .input(z.object({ id: z.number() }))
  .output(PlanetSchema)

export const createPlanetContract = oc
  .input(z.object({ name: z.string(), description: z.string().optional() }))
  .output(PlanetSchema)

export const contract = {
  planet: {
    list: listPlanetsContract,
    find: findPlanetContract,
    create: createPlanetContract,
  },
}
```

A few things to notice:

- `.output` matters here. In Getting Started, the client's result type flows from the handler's return value. A contract has no handler, so `.output` is where that type comes from. Skip it and the result type becomes `unknown`.
- `.output` is not just a type: once implemented, the server validates every response against it at runtime.
- Contracts can also declare typed [errors](/docs/error-handling#typesafe-errors) and [metadata](/docs/metadata). Learn more in the [Procedure Contract documentation](/docs/contract/procedure).

Keep this file free of server code. That is what lets the client import it safely later.

## Implement the Contract

The `implement` function turns your contract into a builder that already knows every procedure's shape. We name it `os` because it works just like the `os` builder from Getting Started, except it is locked to your contract.

```ts twoslash
import { contract } from './shared/contract-first'
// ---cut---
import { implement } from '@orpc/server'

const os = implement(contract)

export const listPlanets = os.planet.list
  .handler(async () => {
    // replace with your database query
    return [
      { id: 1, name: 'Earth' },
      { id: 2, name: 'Mars' },
    ]
  })

export const findPlanet = os.planet.find
  .handler(async ({ input }) => {
    // replace with your database query
    return { id: input.id, name: 'Earth' }
  })

export const createPlanet = os.planet.create
  .handler(async ({ input }) => {
    // replace with your database insert
    return { id: 3, ...input }
  })

export const router = os.router({
  planet: {
    list: listPlanets,
    find: findPlanet,
    create: createPlanet,
  },
})
```

The contract does the heavy lifting:

- `os.planet.find` already knows its input and output types, so you only write the logic. Input is still validated before the handler runs.
- Return the wrong shape from a handler and TypeScript reports an error immediately.
- `os.router` checks completeness: forget to implement a procedure, or put it under the wrong key, and the code does not compile.

Implementations can use [middleware](/docs/middleware) and [context](/docs/context) as usual. Learn more in the [Contract Implementation documentation](/docs/contract/implementation).

## Create a Server

Serving the router works exactly as in [Getting Started](/docs/getting-started#create-a-server): `RPCHandler` matches each request to a procedure, validates the input, runs your handler, and sends the result back.

```ts twoslash
/// <reference types="node" />
import { router } from './shared/contract-first'
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

:::info
To serve the same contract as a REST API, add [routing metadata](/docs/openapi/routing) such as `.meta(openapi({ method: 'GET', path: '/planets' }))` to the contract itself, serve it with the [OpenAPI Handler](/docs/openapi/handler), and generate an [OpenAPI specification](/docs/openapi/specification) straight from the contract.
:::

## Create a Client

Here is the payoff. Type the client with `RouterContractClient<typeof contract>`: it needs only the contract, which contains no business logic, so no server code can leak into the client bundle.

```ts twoslash
import type { contract } from './shared/contract-first'
// ---cut---
import type { RouterContractClient } from '@orpc/contract'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

const link = new RPCLink({
  origin: 'http://127.0.0.1:3000',
  url: '/rpc', // <- must match the server's prefix
})

export const orpc: RouterContractClient<typeof contract> = createORPCClient(link)
```

:::tip
Because the contract is plain data plus schemas, you can move it into a shared package that both sides depend on, or even [publish a typed client to npm](/docs/recipes/publish-client-to-npm) for third parties. Learn more in the [Client-Side Clients documentation](/docs/client/client-side).
:::

## Call a Procedure

Calling procedures feels exactly the same as in Getting Started:

```ts twoslash
import { client as orpc } from './shared/contract-first'
// ---cut---
const planets = await orpc.planet.list()

const planet = await orpc.planet.find({ id: 1 })

orpc.planet.create
//          ^|

//

//
```

Both sides now answer to the contract. The server cannot ship a response the contract does not allow, the client cannot send input the contract rejects, and changing the contract surfaces every affected handler and call site as a compile error.

## Next Steps

- Learn contracts in depth: [Procedure Contract](/docs/contract/procedure) and [Router Contract](/docs/contract/router)
- Add middleware and context to implementations in [Contract Implementation](/docs/contract/implementation)
- Already have an OpenAPI spec? [Generate a contract from it](/docs/contract/generate-from-openapi)
- Keep type checking fast in large codebases with the [Contract Client Factory](/docs/contract/client-factory)
- Expose the contract as a REST API with the [OpenAPI Handler](/docs/openapi/handler) and share it via an [OpenAPI specification](/docs/openapi/specification)
