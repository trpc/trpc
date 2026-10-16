---
title: "Contract Client Factory"
description: "Create clients from individual procedure contracts instead of a single root contract, keeping large oRPC codebases fast and decoupled."
---

A single root [client](/docs/client/client-side) is a great way to get started. As your project grows, though, it can lead to type performance issues and tangled dependencies. Splitting the client into smaller service-level clients can help for a while, but very large codebases can still outgrow that approach.

## Requirements

This pattern depends on one consistency rule: every [procedure contract](/docs/contract/procedure) must define `meta.path`, and that path must exactly match the procedure's location in the root contract.

```ts
import { meta, oc } from '@orpc/contract'

export const procedure = oc
  .meta(meta.path(['real', 'path', 'to', 'procedure']))
  .input(z.object({ name: z.string() }))
  .output(z.object({ message: z.string() }))
```

If you use `['real', 'path', 'to', 'procedure']` as the path, the procedure must be mounted at `real.path.to.procedure` in the root contract. This is required for the pattern to work correctly:

```ts
import { procedure } from './path/to/procedure'

const router = {
  real: {
    path: {
      to: {
        procedure,
      },
    },
  }
}
```

## Contract Client Factory

This pattern does not require a single root client. Instead, you configure a client factory that communicates with the server. `createContractClientFactory` accepts an [RPC Link](/docs/rpc/link), an [OpenAPI Link](/docs/openapi/link), or a custom link. It also accepts options similar to [`createORPCClient`](/docs/client/client-side), but with less typesafe because the full contract is not known up front:

```ts
import { createContractClientFactory } from '@orpc/contract'

export const createClient = createContractClientFactory(link, { /** options */})
```

:::warning
If you are using [OpenAPI Link](/docs/openapi/link), or any link that requires the client to be wrapped in `JsonifiedClient`, use `createContractJsonifiedClientFactory` from `@orpc/openapi` instead of `createContractClientFactory`.
:::

You can then create a client by importing a procedure contract directly in the client:

```ts
import { procedure } from './path/to/procedure'

const client = createClient(procedure)
const output = await client(input, {/** options */})
```

The factory also accepts a [router contract](/docs/contract/router), returning a client that mirrors its shape. Procedure paths follow the router shape, prefixed with a base path derived from the first procedure that defines `meta.path`, so passing a sub-router of the root contract works too:

```ts
import { router } from './path/to/router'

const client = createClient(router)
const output = await client.path.to.procedure(input, {/** options */})
```

### `contractRef`

Some integrations still need a root contract. For example, [OpenAPI Link](/docs/openapi/link) and some plugins depend on one. In those cases, `contractRef` can help:

```ts
import { RouterContract } from '@orpc/contract'

const contractRef: RouterContract = {}

const link = new OpenAPILink(contractRef, {
  plugins: [
    new PluginRequireContract(contractRef)
  ]
})

export const createClient = createContractJsonifiedClientFactory(link, { contractRef })
```

The idea behind `contractRef` is simple: every time `createClient` is used, the factory automatically registers every procedure contract inside the passed contract into `contractRef` at its resolved path.

:::info
Some features may not support `contractRef` well. In those cases, import the root contract instead and cast it with `as any` when needed.
:::

## TanStack Query Integration

[TanStack Query Integration](/docs/integrations/tanstack-query) also supports this pattern. First, create a factory that accepts a [contract client factory](#contract-client-factory) and options similar to the [TanStack Query interceptor options](/docs/integrations/tanstack-query#interceptors), but with less type safety because the full contract is not known up front:

```ts
import { createContractUtilsFactory } from '@orpc/tanstack-query'

export const createUtils = createContractUtilsFactory(createClient, { /** options */})
```

:::warning
If you are using [OpenAPI Link](/docs/openapi/link), or any link that requires the client to be wrapped in `JsonifiedClient`, use `createContractJsonifiedUtilsFactory` from `@orpc/tanstack-query` instead of `createContractUtilsFactory`.
:::

You can then create utilities for each procedure contract:

```ts
import { procedure } from './path/to/procedure'

const utils = createUtils(procedure)

const query = useQuery(utils.queryOptions({/** options */}))
```

Like the [contract client factory](#contract-client-factory), it also accepts a [router contract](/docs/contract/router), returning utilities that mirror its shape:

```ts
import { router } from './path/to/router'

const utils = createUtils(router)

const query = useQuery(utils.path.to.procedure.queryOptions({/** options */}))
```

## Pinia Colada Integration

[Pinia Colada Integration](/docs/integrations/pinia-colada) also supports this pattern. First, create a factory that accepts a [contract client factory](#contract-client-factory) and options similar to the [Pinia Colada interceptor options](/docs/integrations/pinia-colada#interceptors), but with less type safety because the full contract is not known up front:

```ts
import { createContractUtilsFactory } from '@orpc/pinia-colada'

export const createUtils = createContractUtilsFactory(createClient, { /** options */})
```

:::warning
If you are using [OpenAPI Link](/docs/openapi/link), or any link that requires the client to be wrapped in `JsonifiedClient`, use `createContractJsonifiedUtilsFactory` from `@orpc/pinia-colada` instead of `createContractUtilsFactory`.
:::

You can then create utilities for each procedure contract:

```ts
import { procedure } from './path/to/procedure'

const utils = createUtils(procedure)

const query = useQuery(utils.queryOptions({/** options */}))
```

Like the [contract client factory](#contract-client-factory), it also accepts a [router contract](/docs/contract/router), returning utilities that mirror its shape:

```ts
import { router } from './path/to/router'

const utils = createUtils(router)

const query = useQuery(utils.path.to.procedure.queryOptions({/** options */}))
```
