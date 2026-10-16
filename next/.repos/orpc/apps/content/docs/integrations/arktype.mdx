---
title: "ArkType Integration"
description: "Use ArkType types directly in oRPC via Standard Schema, with a dedicated JSON Schema converter for OpenAPI generation and Smart Coercion."
sidebar:
  label: "ArkType"
---

:::info
[ArkType](https://arktype.io/) implements [Standard Schema](/docs/integrations/standard-schema), so procedures accept ArkType types without any converter. The converter below is only needed by tools that consume JSON Schema, such as OpenAPI generation and Smart Coercion.
:::

## Installation

```package-install
npm install @orpc/arktype@beta arktype
```

## JSON Schema Converter

`ArkTypeToJsonSchemaConverter` wraps [ArkType's built-in toJsonSchema](https://arktype.io/docs/type-api#tojsonschema) and adds support for additional types such as `bigint` and `Date`. Use it with tools such as the [OpenAPI Generator](/docs/openapi/specification#openapi-generator) and [Smart Coercion](/docs/plugins/smart-coercion). It accepts the same options as ArkType's `toJsonSchema`, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/arktype/src/converter.ts) and ArkType's [JSON Schema configuration docs](https://arktype.io/docs/configuration#tojsonschema) for implementation details.

```ts
import { OpenAPIGenerator } from '@orpc/openapi'
import { ArkTypeToJsonSchemaConverter } from '@orpc/arktype'

const generator = new OpenAPIGenerator({
  converters: [new ArkTypeToJsonSchemaConverter()],
})
```

:::tip
Enable the `cache` option to reuse conversion results when the same schema instance is converted repeatedly. When enabled, repeated conversions return the same JSON schema object, so treat the results as immutable.

```ts
const converter = new ArkTypeToJsonSchemaConverter({ cache: true })
```

:::

### Reusable Types

A common pattern is defining reusable or recursive types using scopes. The converter preserves them in `$defs`, which `OpenAPIGenerator` can then [hoist](/docs/openapi/specification#hoisting-defs) into `components.schemas`.

```ts
import { scope } from 'arktype'

const types = scope({
  Planet: {
    name: 'string',
    neighbors: 'Planet[]',
  },
})

const PlanetSchema = types.export().Planet
```
