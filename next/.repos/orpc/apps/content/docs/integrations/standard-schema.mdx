---
title: "Standard Schema Integration"
description: "Use Zod, Valibot, ArkType, or any Standard Schema library with oRPC, plus automatic JSON Schema conversion via Standard JSON Schema."
sidebar:
  label: "Standard Schema"
---

oRPC natively supports any library that implements the [Standard Schema](https://standardschema.dev/) specification, such as [Zod](/docs/integrations/zod), [Valibot](/docs/integrations/valibot), [ArkType](/docs/integrations/arktype), and [many more](https://standardschema.dev/schema#what-schema-libraries-implement-the-spec). Use them directly in `.input`, `.output`, and `.errors` without any extra setup.

```ts
import * as z from 'zod'
import * as v from 'valibot'

const example = os
  .input(z.object({ name: z.string() }))
  .output(v.object({ name: v.string() }))
```

## Standard JSON Schema

[Standard JSON Schema](https://standardschema.dev/json-schema) is a companion specification that lets a schema library expose JSON Schema conversion in a standard way. Tools that rely on JSON Schema converters, such as the [OpenAPI Generator](/docs/openapi/specification#openapi-generator) and [Smart Coercion](/docs/plugins/smart-coercion), automatically fall back to Standard JSON Schema conversion when no configured converter matches a schema. So if your library also implements Standard JSON Schema, these tools work out of the box without a dedicated converter. Otherwise, the schema is treated as unknown and converted to an empty JSON schema.

### Building Your Own Converter

If your library does not implement Standard JSON Schema, or you want more control over the conversion, you can build your own converter by implementing the `JsonSchemaConverter` interface and passing it to the `converters` option. The first converter whose `condition` matches handles the schema:

```ts
import type { AnySchema } from '@orpc/contract'
import type {
  JsonSchema,
  JsonSchemaConverter,
  JsonSchemaConverterDirection
} from '@orpc/json-schema'
import { toJsonSchema } from '@valibot/to-json-schema'

class MyCustomConverter implements JsonSchemaConverter {
  condition(schema: AnySchema | undefined, _direction: JsonSchemaConverterDirection): boolean {
    return schema?.['~standard'].vendor === 'valibot'
  }

  convert(
    schema: AnySchema | undefined,
    direction: JsonSchemaConverterDirection
  ): [jsonSchema: JsonSchema, optional: boolean] {
    // In most cases, treating the schema as required is acceptable.
    return [toJsonSchema(schema as any), false] as any
  }
}
```
