---
title: "Client-Side Clients"
description: "Create oRPC clients that call procedures remotely over a link, with client context, interceptors, and type inference utilities."
sidebar:
  label: "Client-Side"
---

## Installation

```package-install
npm install @orpc/client@beta
```

## Creating a Client

To create a client, first set up a link that defines how the client communicates with the server. This can be an [RPC Link](/docs/rpc/link), an [OpenAPI Link](/docs/openapi/link), or any custom link. Then create a client for your [router](/docs/router) or [contract](/docs/contract/router) using `createORPCClient`.

```ts
import { createORPCClient } from '@orpc/client'
import { RouterContractClient } from '@orpc/contract'
import { RouterClient } from '@orpc/server'

// if you are following contract-first approach
const contractClient: RouterContractClient<typeof contract> = createORPCClient(link)

// if you are following normal approach
const normalClient: RouterClient<typeof router> = createORPCClient(link)
```

:::tip
You can export `RouterClient<typeof router>` or `RouterContractClient<typeof contract>` from the server to avoid importing the contract or router in the client.
:::

## Calling Procedures

Once your client is set up, you can call your [procedures](/docs/procedure) as if they were local functions.

```ts twoslash
import * as z from 'zod'
import { os, RouterClient } from '@orpc/server'

const router = {
  ping: os.handler(() => 'pong'),
  pong: os.handler(() => 'ping'),
}

declare const client: RouterClient<typeof router>
// ---cut---
const pong = await client.ping()

client.ping
//     ^|

//

//
```

## Client Context

Client context lets you pass values with each call, such as auth tokens or cache hints.

```ts
interface ClientContext {
  token?: string
}

// if you are following contract-first approach
const client: RouterContractClient<typeof contract, ClientContext> = createORPCClient(link)

// if you are following normal approach
const client: RouterClient<typeof router, ClientContext> = createORPCClient(link)

const output = await client.someProcedure(input, {
  context: {
    token: 'abc123',
  },
})
```

## Interceptors

Interceptors let you wrap client calls. They are similar to interceptors in links, but are more typesafe because the exact input, output, and error types of each client are known. You can provide per-client interceptors with `scoped`.

```ts
import { isDefinedError, safe } from '@orpc/client'

const client: RouterClient<typeof router, ClientContext> = createORPCClient(link, {
  interceptors: [
    async ({ context, path, next }) => {
      const [error, data] = await safe(next())

      if (error) {
        if (isDefinedError(error)) {
          // handle typesafe errors
        }

        throw error
      }

      return data
    }
  ],
  scoped: {
    planet: {
      find: {
        interceptors: [ // <- these interceptors only apply to client.planet.find
          async ({ context, path, next }) => {
            return next()
          }
        ]
      }
    }
  }
})
```

:::info
You can use [`safe` and `isDefinedError`](/docs/client/error-handling#using-safe-and-isdefinederror) together for typesafe error handling in interceptors.
:::

## Merging Clients

In oRPC, a client is just an object-like structure. To merge multiple clients, assign each client to a property on a new object:

```ts
const clientA: RouterClient<typeof routerA> = createORPCClient(linkA)
const clientB: RouterClient<typeof routerB> = createORPCClient(linkB)
const clientC: RouterClient<typeof routerC> = createORPCClient(linkC)

export const orpc = {
  a: clientA,
  b: clientB,
  c: clientC,
}
```

## Utilities

:::info
These utilities can also be used for [server-side clients](/docs/client/server-side) and are not specific to client-side clients.
:::

### Infer Client Inputs

Infers input types for each procedure in a client.

```ts
import type { InferClientInputs } from '@orpc/client'

type Inputs = InferClientInputs<typeof client>

type FindPlanetInput = Inputs['planet']['find']
```

### Infer Client Body Inputs

Infers body input types for each procedure in a client. If an endpoint's input includes `{ body: ... }`, only the `body` portion is extracted. Otherwise, the entire input type is used.

```ts
import type { InferClientBodyInputs } from '@orpc/client'

type BodyInputs = InferClientBodyInputs<typeof client>

type FindPlanetBodyInput = BodyInputs['planet']['find']
```

### Infer Client Outputs

Infers output types for each procedure in a client.

```ts
import type { InferClientOutputs } from '@orpc/client'

type Outputs = InferClientOutputs<typeof client>

type FindPlanetOutput = Outputs['planet']['find']
```

### Infer Client Body Outputs

Infers body output types for each procedure in a client. If an endpoint's output includes `{ body: ... }`, only the `body` portion is extracted. Otherwise, the entire output type is used.

```ts
import type { InferClientBodyOutputs } from '@orpc/client'

type BodyOutputs = InferClientBodyOutputs<typeof client>

type FindPlanetBodyOutput = BodyOutputs['planet']['find']
```

### Infer Client Errors

Infers the errors each procedure in a client can throw when using [type-safe error handling](/docs/error-handling#typesafe-errors).

```ts
import type { InferClientErrors } from '@orpc/client'

type Errors = InferClientErrors<typeof client>

type FindPlanetError = Errors['planet']['find']
```

### Infer Client Error

Infers all possible errors the entire client can throw. This is useful with [type-safe error handling](/docs/error-handling#typesafe-errors).

```ts
import type { InferClientError } from '@orpc/client'

type ClientError = InferClientError<typeof client>
```

### Infer Client Context

Infers the [client context](#client-context) type from a client.

```ts
import type { InferClientContext } from '@orpc/client'

type Context = InferClientContext<typeof client>
```
