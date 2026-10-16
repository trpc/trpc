---
title: "OpenAPI Routing"
description: "Use openapi metadata to control how procedures are exposed over HTTP, including methods, paths, path parameters, and prefixes."
---

## Basic Routing

If you do not set OpenAPI routing metadata, a procedure is exposed as a `POST` endpoint whose path is derived from the router structure. For example:

```ts twoslash
import { os } from '@orpc/server'
// ---cut---
import { openapi } from '@orpc/openapi'

const router = {
  planet: {
    list: os
      .meta(openapi({ method: 'GET', path: '/planets' }))
      .handler(async () => [{ id: 'earth', name: 'Earth' }]),
    create: os
      .handler(async () => ({})),
  }
}
```

In this example, `list` is exposed as `GET /planets` because it overrides the default method and path. `create` keeps the default behavior, so it is exposed as `POST /planet/create`.

## Path Parameters

To define a path parameter, use `{name}` in the `path` and add the same field as a required key in the input schema:

```ts
import { z } from 'zod'

const getPlanet = os
  .meta(openapi({ method: 'GET', path: '/planets/{id}' }))
  .input(z.object({ id: z.string() }))
```

For catch-all path segments that may include `/`, use `{+name}`:

```ts
const getFile = os
  .meta(openapi({ method: 'GET', path: '/files/{+path}' }))
  .input(z.object({ path: z.string() }))
```

A path can have only one `{+name}`, but more segments can follow it, as in `/files/{+path}/raw`.

:::info
To customize path parameter encoding and decoding, see [Path Parameter Styles](/docs/openapi/input-and-output-mapping#path-parameter-styles).
:::

## Prefixes

Define `prefix` to prepend a path to a procedure, or an entire router:

```ts
const planetBuilder = os.meta(openapi({ prefix: '/planets' }))

const listPlanets = planetBuilder
  .meta(openapi({ method: 'GET', path: '/' }))
  .handler(async () => [{ id: 'earth', name: 'Earth' }])

const createPlanet = planetBuilder
  .handler(async () => ({}))

const router = os.meta(openapi({ prefix: '/api/v2' })).router({
  planet: {
    list: listPlanets,
    create: createPlanet,
  },
})
```

In this example, `listPlanets` is exposed as `GET /api/v2/planets/`. `createPlanet` is exposed as `POST /api/v2/planets/planet/create`.

### Path Parameters in Prefixes

Prefixes can also include path parameters, but they must be defined as required fields in the input schema.

```ts
const base = os
  .meta(openapi({ prefix: '/{workspaceId}' }))
  .input(z.object({ workspaceId: z.string() }))
  .use(({ next }, { workspaceId }) => {
    console.log('Workspace ID:', workspaceId)
    return next()
  })

const procedure = base
  .meta(openapi({ method: 'GET', path: '/planets/{id}' }))
  .input(z.object({ id: z.string() }))
  .handler(async ({ input }) => {
    console.log('Workspace ID:', input.workspaceId)
    console.log('Planet ID:', input.id)
  })
```

## Lazy Router

When using a [lazy router](/docs/router#lazy-router), define a `prefix` so lazy loading is triggered only for relevant requests:

```ts
const router = {
  project: os
    .meta(openapi({ prefix: '/projects' }))
    .lazy(() => import('./project')),
}
```

## Metadata Merging

When `openapi` is applied multiple times, `prefix` values are concatenated in definition order, while `method`, `path`, and `successStatus` are overridden by the most recent call. For the full merge behavior of every field, see [Metadata Merging](/docs/openapi/specification#metadata-merging).

```ts
const router = os
  .meta(openapi({ prefix: '/api/v2' }))
  .router({
    get: os
      .meta(openapi({ prefix: '/planets' }))
      .meta(openapi({ method: 'GET', path: '/planets/{id}' }))
      .meta(openapi({ path: '/{id}' }))
      .input(z.object({ id: z.string() }))
      .handler(async () => ({})),
  })
```

These calls are equivalent to:

```ts
const router = {
  get: os
    .meta(openapi({
      prefix: '/api/v2/planets',
      method: 'GET',
      path: '/{id}',
    }))
    .handler(async () => ({})),
}
```

:::info
Metadata resets to its default behavior when set to `undefined` in subsequent calls:

```ts
const example = os
  .meta(openapi({ prefix: '/api/v2' }))
  .meta(openapi({ prefix: undefined }))
```

In this example, the final `prefix` is `undefined`, so no prefix is applied to `example`.

:::

## Shorthands

For common cases, use the shorthand helpers:

```ts
const listPlanets = os
  .meta(openapi.prefix('/planets'))
  .meta(openapi.method('GET'))
  .meta(openapi.path('/'))
```

## `.route` extension

Import `@orpc/openapi/extensions/route` from a module that always runs during initialization, such as the file where you define your base builder or create your server. This adds a `.route` method to the builder, allowing you to define OpenAPI metadata directly without wrapping it in `.meta(openapi(...))`.

<CodeGroup>

```ts usage
const ping = base
  .route({
    method: 'GET',
    path: '/ping',
  })
  .input(z.object({ name: z.string(), }))
  .handler(async ({ input }) => {
    return `Hello ${input.name}!`
  })
```

```ts setup
import '@orpc/openapi/extensions/route'

import { os } from '@orpc/server'

export const base = os
```

</CodeGroup>
