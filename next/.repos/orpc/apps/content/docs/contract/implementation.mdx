---
title: "Contract Implementation"
description: "Learn how to implement a contract with the implement function, adding type-checked handlers, middleware, and routers to every procedure."
---

## Implementer

The `implement` function turns a contract into an implementer. Use it to build procedures, routers, and create middleware with full type safety.

```ts twoslash
import { contract } from './shared/planet'
// ---cut---
import { implement } from '@orpc/server'

const implementer = implement(contract)
  .$context<{ something?: string }>() // <- define initial context

implementer.planet.list
//                 ^|

//

//

//
//
//
```

### Initial Context

Use `.$context` to declare the initial context required for a procedure to execute.
Learn more in the [Context Documentation](/docs/context).

## Implementing Procedures

Define a `.handler` for a procedure contract to provide its business logic.

```ts twoslash
import { contract } from './shared/planet'
import { implement } from '@orpc/server'

const implementer = implement(contract)
const requireAuth = implementer.middleware(({ next }) => next())
// ---cut---
const listPlanet = implementer.planet.list
  .use(requireAuth) // <- Apply authentication middleware
  .handler(({ input }) => {
    // Your logic for listing planets
    return []
  })
```

:::info
If middleware needs to wrap validation, apply it at the router level instead. In this example, use `implementer.use` to apply it globally or `implementer.planet.use` to apply it to the `planet` router before `.list`.

```ts
const listPlanet = implementer
  .planet
  .use(requireAuth) // <- middleware wraps validation
  .list
  .handler(({ input }) => {
    // Your logic for listing planets
    return []
  })
```

:::

## Implementing Routers

Create the root router with `.router` to assemble your API. This enables full type-checking and runtime contract enforcement.

```ts
const router = implementer.router({
  planet: {
    list: listPlanet,
    find: findPlanet,
    create: createPlanet,
  },
})
```

### Extending Router

Like a normal [router](/docs/router), an implementer router can also be extended with shared behavior. For example, you can apply authentication middleware to every procedure:

```ts
const router = implementer.use(requireAuth).router({
  planet: {
    list: listPlanet,
    find: findPlanet,
    create: createPlanet,
  },
})
```

:::danger
If you apply middleware with `.use` at both the router and procedure levels, it may run more than once. That duplication can hurt performance. To avoid redundant middleware execution, see the [Dedupe Middleware](/docs/recipes/dedupe-middleware) recipe.
:::

## Creating Middleware

The implementer can also create [middleware](/docs/middleware). Middleware created this way can infer the contract's [typesafe errors](/docs/error-handling#typesafe-errors). If not all contracts define the same errors, use the `in` operator to check that an error exists before using it.

```ts
const ratelimit = implementer.middleware(async ({ next, errors }) => {
  if ('TOO_MANY_REQUESTS' in errors) {
    // Apply rate limiting only when TOO_MANY_REQUESTS is defined by the contract.
    if (isRatelimitReached) {
      throw errors.TOO_MANY_REQUESTS()
    }
  }

  return next()
})
```

:::info
You do not have to create middleware from the implementer. Any type-compatible middleware can be used.
:::

## Reusability

Each implementer call creates a new instance, which avoids reference issues and makes contracts easy to reuse and extend.

```ts
const pub = implementer // Base setup for procedures that publish
const authed = implementer.use(requireAuth) // Extends 'pub' with authentication

const listPlanets = pub.planet.list.handler(({ input }) => {
  // Your logic for listing planets without authentication
  return []
})

const createPlanet = authed.planet.create.handler(({ input }) => {
  // Your logic for creating planets with authentication
  return { }
})
```

This pattern helps prevent duplication while maintaining flexibility.
