---
title: "OpenAPI Specification"
description: "Learn how to configure openapi metadata and generate OpenAPI 3.2, 3.1, or 3.0 documents from your oRPC contracts and routers with OpenAPIGenerator."
---

## Metadata

Use `openapi` metadata to control how a procedure appears in the generated OpenAPI document:

```ts
import { oc } from '@orpc/contract'
import { openapi } from '@orpc/openapi'
import { z } from 'zod'

const getPlanet = oc
  .meta(openapi({
    method: 'GET',
    path: '/planets/{id}',
    operationId: 'getPlanet',
    summary: 'Get a planet',
    description: 'Returns a single planet.',
    tags: ['planets'],
    successStatus: 200,
    successDescription: 'Planet payload',
  }))
  .input(z.object({
    id: z.string(),
  }))
  .output(z.object({
    id: z.string(),
    name: z.string(),
  }))
```

:::info
For routing metadata, you can learn more in [OpenAPI Routing](/docs/openapi/routing). For input and output mapping metadata, see [OpenAPI Input and Output Mapping](/docs/openapi/input-and-output-mapping).
:::

### Customizing the Operation Object

Use `spec` to customize the generated operation object. If `spec` is an object, it replaces the generated operation object entirely. If `spec` is a callback, it receives the final operation object and returns an extended version. The operation object always follows OpenAPI 3.2, whatever [version](#openapi-version) you generate.

```ts
const getPlanet = oc
  .meta(openapi({
    method: 'GET',
    path: '/planets/{id}',
    spec: current => ({
      ...current,
      security: [{ bearerAuth: [] }],
    }),
  }))
  .input(z.object({ id: z.string() }))
```

### Metadata Merging

When `openapi` is applied multiple times, most fields, such as `method`, `path`, `operationId`, `summary`, and `description`, are overridden by the most recent call. Only the following fields are merged:

- `tags` and `prefix` values are concatenated in definition order.
- `paramsStyles` and `queryStyles` are merged per parameter. The most recent style defined for a parameter wins.
- `spec` values are combined: two functions are chained so the most recent one receives the result of the previous one, a function combined with an object is applied to that object, and between two objects the most recent one wins.

For implementation details, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/openapi/src/meta.ts).

```ts
const router = os
  .meta(openapi({
    tags: ['planets'],
    spec: current => ({
      ...current,
      security: [{ bearerAuth: [] }],
    }),
  }))
  .router({
    list: os
      .meta(openapi({ method: 'GET', summary: 'List planets', tags: ['list'] }))
      .meta(openapi({
        spec: {
          operationId: 'getPlanet',
          summary: 'List planets',
          responses: {
            200: {
              description: 'List of planets',
            },
          }
        }
      }))
      .input(z.object({ q: z.string().optional() }))
      .handler(async () => ([])),
  })
```

These are equivalent to:

```ts
const router = {
  list: os
    .meta(openapi({
      method: 'GET',
      tags: ['planets', 'list'],
      summary: 'List planets',
      spec: {
        operationId: 'getPlanet',
        summary: 'List planets',
        responses: {
          200: {
            description: 'List of planets',
          },
        },
        security: [{ bearerAuth: [] }],
      },
    }))
    .input(z.object({ q: z.string().optional() }))
    .handler(async () => ([])),
}
```

:::info
Metadata resets to its default behavior when set to `undefined` in subsequent calls:

```ts
const example = os
  .meta(openapi({ tags: ['planets'] }))
  .meta(openapi({ tags: undefined }))
```

In this example, the final `tags` is `undefined`, so no tags are applied to `example`.

:::

## OpenAPI Generator

`OpenAPIGenerator` turns a [contract](/docs/contract/router) or a [router](/docs/router) into an OpenAPI document.

```ts
import { OpenAPIGenerator } from '@orpc/openapi'

const generator = new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
})

const spec = await generator.generate(router, {
  version: '3.2.0',
  base: {
    info: {
      title: 'Planet API',
      version: '1.0.0',
    },
    servers: [
      { url: 'https://example.com/api' },
    ],
  },
})
```

`base` provides the OpenAPI 3.2 document fields to start from, such as `info`, `servers`, or `components`. The `openapi` field comes from `version`.

### OpenAPI Version

`version` selects the OpenAPI version, `3.2.0` by default. Any `3.0.x`, `3.1.x`, or `3.2.x` value works.

```ts
const spec = await generator.generate(router, {
  version: '3.0.4',
})
```

The document is always built as OpenAPI 3.2, so `base`, [`openapi({ spec })`](#customizing-the-operation-object), and every JSON schema follow 3.2. Older versions come from downgrading the whole document with [`@openapi-spec/downgrader`](https://github.com/middleapi/openapi-spec/blob/main/packages/downgrader/README.md), which converts what the older version can still express and removes the rest.

:::warning
`QUERY` operations require OpenAPI 3.2. Generating an older version from a router with a `QUERY` procedure throws.
:::

### Json Schema Converters

`OpenAPIGenerator` relies on JSON Schema converters to translate your input, output, and error schemas into JSON Schemas. oRPC provides dedicated converters through the [Zod](/docs/integrations/zod), [Valibot](/docs/integrations/valibot), and [ArkType](/docs/integrations/arktype) integrations:

```ts
import { ZodToJsonSchemaConverter } from '@orpc/zod'
import { ValibotToJsonSchemaConverter } from '@orpc/valibot'
import { ArkTypeToJsonSchemaConverter } from '@orpc/arktype'

const generator = new OpenAPIGenerator({
  converters: [
    new ZodToJsonSchemaConverter(),
    new ValibotToJsonSchemaConverter(),
    new ArkTypeToJsonSchemaConverter(),
  ],
})
```

:::info
When no matching converter is configured, `OpenAPIGenerator` falls back to [Standard Json Schema](https://standardschema.dev/json-schema) conversion. See [Standard Schema Integration](/docs/integrations/standard-schema) for details, including how to build your own converter.
:::

### Custom Serializer

If your [OpenAPI Handler](/docs/openapi/handler#custom-serializer) uses a custom serializer, configure `OpenAPIGenerator` with the same serializer so the generated document matches the actual formats. For details, see [OpenAPI Serializer](/docs/openapi/serializer).

```ts
const handler = new OpenAPIGenerator({
  serializer: new OpenAPISerializer({
    handlers: {
      // ...custom handlers
    },
  }),
})
```

### Filtering Procedures

Use `filter` to exclude procedures from the generated document:

```ts
const spec = await generator.generate(router, {
  filter: (_procedure, path) => !path.includes('internal'),
})
```

### Hoisting `$defs`

Root `$defs` generated by your converters are moved into `components.schemas`. Use `customComponentName` to rename them:

```ts
const spec = await generator.generate(router, {
  customComponentName: (defName, defSchema) => `Api${defName}`,
})
```

#### Custom Error Response Schemas

If your [OpenAPI Handler](/docs/openapi/handler#custom-error-response) uses custom error response formats, configure `OpenAPIGenerator` with the same logic so the generated document matches the actual error response formats.

```ts
import { COMMON_ERROR_STATUS_MAP } from '@orpc/openapi'

const spec = await generator.generate(router, {
  errorStatusMap: {
    ...COMMON_ERROR_STATUS_MAP,
    PLANET_GONE: 410,
  },
  customErrorResponseBodySchema: (definedErrors, status) => {
    if (status === 410) {
      return {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['code', 'message'],
      }
    }

    // fallback to default by returning null or undefined
    return null
  },
})
```
