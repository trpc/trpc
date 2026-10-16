---
title: "Valibot Integration"
description: "Use Valibot schemas directly in oRPC via Standard Schema, with a dedicated JSON Schema converter for OpenAPI generation and Smart Coercion."
sidebar:
  label: "Valibot"
---

:::info
[Valibot](https://valibot.dev/) implements [Standard Schema](/docs/integrations/standard-schema), so procedures accept Valibot schemas without any converter. The converter below is only needed by tools that consume JSON Schema, such as OpenAPI generation and Smart Coercion.
:::

## Installation

```package-install
npm install @orpc/valibot@beta valibot
```

## JSON Schema Converter

`ValibotToJsonSchemaConverter` wraps [Valibot's built-in toJsonSchema](https://github.com/open-circle/valibot/blob/main/packages/to-json-schema/README.md) and adds support for additional types such as `v.bigint()`, `v.date()`, `v.set()`, and `v.map()`. Use it with tools such as the [OpenAPI Generator](/docs/openapi/specification#openapi-generator) and [Smart Coercion](/docs/plugins/smart-coercion). It accepts the same options as Valibot's `toJsonSchema`, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/valibot/src/converter.ts) for implementation details.

```ts
import { OpenAPIGenerator } from '@orpc/openapi'
import { ValibotToJsonSchemaConverter } from '@orpc/valibot'

const generator = new OpenAPIGenerator({
  converters: [new ValibotToJsonSchemaConverter()],
})
```

:::tip
Enable the `cache` option to reuse conversion results when the same schema instance is converted repeatedly. When enabled, repeated conversions return the same JSON schema object, so treat the results as immutable.

```ts
const converter = new ValibotToJsonSchemaConverter({ cache: true })
```

:::

### Reusable Schemas

A common pattern is defining reusable or recursive schemas via definitions. The converter preserves them in `$defs`, which `OpenAPIGenerator` can then [hoist](/docs/openapi/specification#hoisting-defs) into `components.schemas`. For more on how definitions work in Valibot, see [Valibot JSON Schema Definitions](https://github.com/open-circle/valibot/blob/main/packages/to-json-schema/README.md#definitions).

```ts
import * as v from 'valibot'

const PlanetSchema = v.object({
  id: v.string(),
  name: v.string(),
})

const generator = new OpenAPIGenerator({
  converters: [
    new ValibotToJsonSchemaConverter({
      definitions: { PlanetSchema },
    }),
  ],
})
```
