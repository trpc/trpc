---
title: "Router"
description: "Organize oRPC procedures into nestable routers, extend them with shared middleware, lazy-load routes, and infer their types."
---

:::info
A standalone [procedure](/docs/procedure) is also a router, so you can use all router features on individual procedures too.
:::

## Overview

Define a router as a plain JavaScript object where each key maps to a procedure:

```ts twoslash
import { os } from '@orpc/server'

const ping = os.handler(async () => 'ping')
const pong = os.handler(async () => 'pong')

export const router = {
  ping,
  pong,
  nested: { ping, pong }
}
```

:::warning
For compatibility, do not use these router keys: `then`, `bind`, `call`, `apply`, `valueOf`, `toString`, `toJSON`.
:::

## Extending Router

You can extend a router with shared behavior. For example, by applying authentication middleware or attaching metadata to every procedure:

```ts
const router = os.use(requiredAuth).meta(requireAuthMeta).router({
  ping,
  pong,
  nested: {
    ping,
    pong,
  }
})
```

:::danger
If you apply middleware with `.use` at both the router and procedure levels, it may run more than once. That duplication can hurt performance. To avoid redundant middleware execution, see the [Dedupe Middleware](/docs/recipes/dedupe-middleware) recipe.
:::

## Lazy Router

Routers can also be lazy-loaded. This is useful for code splitting and can improve cold start performance by deferring route initialization until it is needed.

<CodeGroup>

```ts router.ts
const router = {
  ping,
  pong,
  planet: os.lazy(() => import('./planet'))
}
```

```ts planet.ts
const PlanetSchema = z.object({
  id: z.number().int().min(1),
  name: z.string(),
  description: z.string().optional(),
})

export const listPlanet = os
  .input(
    z.object({
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.number().int().min(0).default(0),
    }),
  )
  .handler(async ({ input }) => {
    // your list code here
    return [{ id: 1, name: 'name' }]
  })

export default {
  list: listPlanet,
  // ...
}
```

</CodeGroup>

## Utilities

:::info
A standalone [procedure](/docs/procedure) is also a router, so these utilities work with procedures too.
:::

### Infer Router Inputs

Infers the input type for each procedure in the router.

```ts twoslash
import type { router } from './shared/planet'
// ---cut---
import type { InferRouterInputs } from '@orpc/server'

export type Inputs = InferRouterInputs<typeof router>

type FindPlanetInput = Inputs['planet']['find']
```

### Infer Router Outputs

Infers the output type for each procedure in the router.

```ts twoslash
import type { router } from './shared/planet'
// ---cut---
import type { InferRouterOutputs } from '@orpc/server'

export type Outputs = InferRouterOutputs<typeof router>

type FindPlanetOutput = Outputs['planet']['find']
```

### Infer Router Initial Contexts

Infers the [initial context](/docs/context#initial-context) for each procedure in the router.

```ts twoslash
import type { router } from './shared/planet'
// ---cut---
import type { InferRouterInitialContexts } from '@orpc/server'

export type InitialContexts = InferRouterInitialContexts<typeof router>

type FindPlanetInitialContext = InitialContexts['planet']['find']
```

### Infer Router Final Contexts

Infers the final context for each procedure in the router by combining the [initial and injected context](/docs/context#combining-initial-and-injected-context). This is the closest match to the context the procedure's handler receives.

```ts twoslash
import type { router } from './shared/planet'
// ---cut---
import type { InferRouterFinalContexts } from '@orpc/server'

export type FinalContexts = InferRouterFinalContexts<typeof router>

type FindPlanetFinalContext = FinalContexts['planet']['find']
```

### Infer Router Errors

Infers the throwable errors each procedure in a router can produce.

```ts twoslash
import type { router } from './shared/planet'
// ---cut---
import type { InferRouterErrors } from '@orpc/server'

export type Errors = InferRouterErrors<typeof router>

type FindPlanetError = Errors['planet']['find']
```

### Infer Router Error

Infers all possible throwable errors the entire router can produce. This is useful when you want a single type for router-wide error handling.

```ts twoslash
import type { router } from './shared/planet'
// ---cut---
import type { InferRouterError } from '@orpc/server'

export type RouterError = InferRouterError<typeof router>
```
