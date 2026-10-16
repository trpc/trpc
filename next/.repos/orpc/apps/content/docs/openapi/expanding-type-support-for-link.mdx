---
title: "Expanding Type Support for OpenAPI Link"
description: "Restore native types like Date and bigint on OpenAPI Link clients using the Response Validation or Smart Coercion plugins."
---

Because of [OpenAPI Serializer limitations](/docs/openapi/serializer#limitations), values like `Date` and `bigint` are received by the client in JSON-friendly form. You can convert them back to native types on the client with either [Response Validation Plugin](/docs/plugins/response-validation) or [Smart Coercion Plugin](/docs/plugins/smart-coercion), but only under the conditions described below.

## Choose a Plugin

- Use [Response Validation Plugin](/docs/plugins/response-validation) when you want manual control over coercion logic and can define explicit coercion rules in your schemas.
- Use [Smart Coercion Plugin](/docs/plugins/smart-coercion) when you want automatic coercion based on schema instead of defining coercion logic yourself.

:::warning
These plugins can only restore types that the [OpenAPI Serializer](/docs/openapi/serializer) can represent. If you need additional types, extend the serializer first.

Nested `Blob` and `File` values are still limited by [Bracket Notation](/docs/openapi/bracket-notation#limitations).
:::

## Use Response Validation Plugin

Use [Response Validation Plugin](/docs/plugins/response-validation) when you want to manually control how values are converted back to native types. The coercion rules live in your contract schemas, so the behavior stays explicit and predictable.

```ts
const contract = oc.output(z.object({
  date: z.coerce.date<Date>(),
  bigint: z.coerce.bigint<bigint>(),
}))

const procedure = implement(contract).handler(() => ({
  date: new Date(),
  bigint: 123n,
}))
```

The server still returns JSON-friendly data:

```ts
const rawOutput = {
  date: '2025-09-01T07:24:39.000Z',
  bigint: '123',
}
```

With `ResponseValidationLinkPlugin`, the client validates that response and applies your schema coercion before your code uses it.

```ts
const output = {
  date: new Date('2025-09-01T07:24:39.000Z'),
  bigint: 123n,
}
```

### Setup

Add the plugin to your link, then remove the `JsonifiedClient` wrapper from the client type.

```ts
import type { RouterContractClient } from '@orpc/contract'
import { ResponseValidationLinkPlugin } from '@orpc/contract/plugins'

const link = new OpenAPILink(contract, {
  plugins: [
    new ResponseValidationLinkPlugin(contract), // [!code ++]
  ],
})

const client: JsonifiedClient<RouterContractClient<typeof contract>> = createORPCClient(link) // [!code --]
const client: RouterContractClient<typeof contract> = createORPCClient(link) // [!code ++]
```

## Use Smart Coercion Plugin

Use [Smart Coercion Plugin](/docs/plugins/smart-coercion) when you want the client to coerce values automatically from schema instead of adding coercion logic to each schema manually.

```ts
import type { RouterContractClient } from '@orpc/contract'
import { SmartCoercionLinkPlugin } from '@orpc/json-schema'

const link = new OpenAPILink(contract, {
  plugins: [
    new SmartCoercionLinkPlugin(contract), // [!code ++]
  ],
})

const client: JsonifiedClient<RouterContractClient<typeof contract>> = createORPCClient(link) // [!code --]
const client: RouterContractClient<typeof contract> = createORPCClient(link) // [!code ++]
```
