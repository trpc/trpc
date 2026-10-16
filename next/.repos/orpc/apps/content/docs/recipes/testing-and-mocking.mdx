---
title: "Testing and Mocking"
description: "Learn how to test oRPC procedures directly with server-side clients, create mock implementations with the implementer, and mock network requests with MSW."
---

## Testing

For fast, focused tests, use [Server-Side Clients](/docs/client/server-side) or call your procedures directly with `call`. This lets you verify validation, middleware, and handler logic without going through HTTP.

```ts
import { call } from '@orpc/server'

it('lists planets', async () => {
  await expect(
    call(router.planet.list, { page: 1, size: 10 })
  ).resolves.toEqual([
    { id: '1', name: 'Earth' },
    { id: '2', name: 'Mars' },
  ])
})
```

:::info
For a production-like test setup, create [fetch-based internal clients](/docs/recipes/optimizing-ssr#implementation).
:::

## Mocking

Use the [Implementer](/docs/contract/implementation) to create test-specific versions of a [procedure](/docs/procedure) or [router](/docs/router). This is useful when one part of your system depends on another procedure, but your test should not execute the real implementation.

```ts twoslash
import { router } from './shared/planet'
// ---cut---
import { implement } from '@orpc/server'

const fakeListPlanet = implement(router.planet.list).handler(() => [])
```

Use `fakeListPlanet` anywhere your test would normally use the real `listPlanet` procedure.

:::info
`implement` is also useful for building mock servers in frontend tests.
:::

:::warning
`implement` does not support [lazy routers](/docs/router#lazy-router) directly. If you need to mock one, first [unlazy the router](/docs/contract/router#router-to-contract).
:::

## Mocking Network Requests

To mock at the network level instead, for example in [Storybook](https://storybook.js.org/) stories or browser tests, use the [MSW Integration](/docs/integrations/msw). It turns a contract or router into typed [MSW](https://mswjs.io/) request handlers served through a real fetch handler:

```ts
import { createHTTPUtils } from '@orpc/experimental-msw'
import { RPCHandler } from '@orpc/server/fetch'

const mock = createHTTPUtils(router, {
  prefix: '/rpc',
  handler: router => new RPCHandler(router),
})

const handlers = [
  mock.planet.list.handler(() => []),
]
```
