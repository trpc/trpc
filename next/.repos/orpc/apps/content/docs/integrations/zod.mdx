---
title: "Zod Integration"
description: "Use Zod schemas directly in oRPC via Standard Schema, with a dedicated JSON Schema converter and registries for customizing generated schemas."
sidebar:
  label: "Zod"
---

:::warning
`@orpc/zod` requires Zod v4 or later.
:::

:::info
[Zod](https://zod.dev/) implements [Standard Schema](/docs/integrations/standard-schema), so procedures accept Zod schemas without any converter. The converter below is only needed by tools that consume JSON Schema, such as OpenAPI generation and Smart Coercion.
:::

## Installation

```package-install
npm install @orpc/zod@beta zod
```

## JSON Schema Converter

`ZodToJsonSchemaConverter` wraps [Zod's built-in toJSONSchema](https://zod.dev/json-schema?id=ztojsonschema#ztojsonschema) and adds support for additional types such as `z.bigint()`, `z.date()`, `z.set()`, and `z.map()`. Use it with tools such as the [OpenAPI Generator](/docs/openapi/specification#openapi-generator) and [Smart Coercion](/docs/plugins/smart-coercion). It accepts the same options as Zod's `toJSONSchema`, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/zod/src/converter.ts) for implementation details.

```ts
import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod'

const generator = new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
})
```

:::tip
Enable the `cache` option to reuse conversion results when the same schema instance is converted repeatedly. When enabled, repeated conversions return the same JSON schema object, so treat the results as immutable.

```ts
const converter = new ZodToJsonSchemaConverter({ cache: true })
```

:::

### Reusable Schemas

A common pattern is defining reusable schemas with `id` metadata. The converter places them in `$defs`, which `OpenAPIGenerator` then [hoists](/docs/openapi/specification#hoisting-defs) into `components.schemas`. For more on `id` and `$ref` in Zod, see [Zod JSON Schema Registries](https://zod.dev/json-schema?id=registries#registries).

```ts
import * as z from 'zod'

const PlanetSchema = z.object({
  id: z.string(),
  name: z.string(),
}).meta({ id: 'Planet' })
```

### Customizing Generated JSON Schemas

`@orpc/zod` exposes registries for customizing the JSON schema generated for a given Zod schema. Registered entries are shallow merged over the generated JSON schema: `JSON_SCHEMA_REGISTRY` applies to both input and output, while `JSON_SCHEMA_INPUT_REGISTRY` and `JSON_SCHEMA_OUTPUT_REGISTRY` apply to a single direction and win on conflicting keys:

```ts
import {
  JSON_SCHEMA_INPUT_REGISTRY,
  JSON_SCHEMA_OUTPUT_REGISTRY,
  JSON_SCHEMA_REGISTRY,
} from '@orpc/zod'
import * as z from 'zod'

const user = z.object({
  name: z.string(),
  age: z.string().transform(v => Number(v)),
})

JSON_SCHEMA_REGISTRY.add(user, {
  description: 'A user',
})

JSON_SCHEMA_INPUT_REGISTRY.add(user, {
  examples: [{ name: 'John', age: '20' }],
})

JSON_SCHEMA_OUTPUT_REGISTRY.add(user, {
  examples: [{ name: 'John', age: 20 }],
})
```
