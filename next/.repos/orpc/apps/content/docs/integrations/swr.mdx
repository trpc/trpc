---
title: "SWR Integration"
description: "Use oRPC with SWR through lightweight key, fetcher, subscriber, and mutator helpers for data fetching, subscriptions, and mutations in React."
sidebar:
  label: "SWR"
---

:::warning
This guide assumes you are already familiar with [SWR](https://swr.vercel.app/). If you need a refresher, review the official SWR documentation before continuing.
:::

## Installation

```package-install
npm install @orpc/swr@beta
```

## Setup

Before you begin, set up either a [server-side client](/docs/client/server-side) or a [client-side client](/docs/client/client-side).

```ts
import { createSWRUtils } from '@orpc/swr'

export const orpc = createSWRUtils(client)

orpc.planet.find.key({ input: { id: 123 } })
```

<Expandable title="Avoiding Key Conflicts?">

You can avoid key conflicts by passing a unique prefix when creating your utils:

```ts
const userORPC = createSWRUtils(userClient, {
  prefix: 'user'
})

const postORPC = createSWRUtils(postClient, {
  prefix: 'post'
})
```

</Expandable>

## Data Fetching

Use `.key` and `.fetcher` methods to configure `useSWR` for data fetching:

```ts
import useSWR from 'swr'

const { data, error, isLoading } = useSWR(
  orpc.planet.find.key({ input: { id: 123 } }),
  orpc.planet.find.fetcher({ context: { cache: true } }), // Provide client context if needed
)
```

## Infinite Queries

Use `.key` and `.fetcher` methods to configure `useSWRInfinite` for infinite queries:

```ts
import useSWRInfinite from 'swr/infinite'

const { data, error, isLoading, size, setSize } = useSWRInfinite(
  (index, previousPageData) => {
    if (previousPageData && !previousPageData.nextCursor) {
      return null // reached the end
    }

    return orpc.planet.list.key({ input: { cursor: previousPageData?.nextCursor } })
  },
  orpc.planet.list.fetcher({ context: { cache: true } }), // Provide client context if needed
)
```

## Subscriptions

Use `.key` and `.subscriber` methods to configure `useSWRSubscription` to subscribe to an [AsyncIteratorObject](/docs/async-iterator-object):

```ts
import useSWRSubscription from 'swr/subscription'

const { data, error } = useSWRSubscription(
  orpc.streamed.key({ input: { id: 3 } }),
  orpc.streamed.subscriber({ context: { cache: true }, maxChunks: 10 }), // Provide client context if needed
)
```

Use `.liveSubscriber` to subscribe to the latest events without chunking:

```ts
import useSWRSubscription from 'swr/subscription'

const { data, error } = useSWRSubscription(
  orpc.streamed.key({ input: { id: 3 } }),
  orpc.streamed.liveSubscriber({ context: { cache: true } }), // Provide client context if needed
)
```

## Mutations

Use `.key` and `.mutator` methods to configure `useSWRMutation` for mutations with automatic revalidation on success:

```ts
import useSWRMutation from 'swr/mutation'

const { trigger, isMutating } = useSWRMutation(
  orpc.planet.list.key(),
  orpc.planet.create.mutator({ context: { cache: true } }), // Provide client context if needed
)

trigger({ name: 'New Planet' }) // auto revalidate orpc.planet.list.key() on success
```

## Manual Revalidation

Use `.matcher` to invalidate data manually:

```ts
import { mutate } from 'swr'

mutate(orpc.matcher()) // invalidate all orpc data
mutate(orpc.planet.matcher()) // invalidate all planet data
mutate(orpc.planet.find.matcher({ input: { id: 123 }, strategy: 'exact' })) // invalidate specific planet data
```

## Calling Clients

Use `.call` to call a procedure client directly. It's an alias for corresponding procedure client.

```ts
const planet = await orpc.planet.find.call({ id: 123 })
```

## Operation Context

When clients are invoked through the SWR integration, an **operation context** is automatically added to the [client context](/docs/rpc/link#client-context). This context can be used to configure the request behavior, like setting the HTTP method.

```ts
import {
  SWR_OPERATION_CONTEXT_SYMBOL,
  SWROperationContext,
} from '@orpc/swr'

interface ClientContext extends SWROperationContext {
}

const GET_OPERATION_TYPE = new Set(['fetcher', 'subscriber', 'liveSubscriber'])

const link = new RPCLink<ClientContext>({
  method: ({ context }, path) => {
    const operationType = context[SWR_OPERATION_CONTEXT_SYMBOL]?.type

    if (operationType && GET_OPERATION_TYPE.has(operationType)) {
      return 'GET'
    }

    return 'POST'
  },
})
```
