---
title: "Generate Contract from OpenAPI"
description: "Generate an oRPC contract from an existing OpenAPI specification with Hey API's orpc plugin instead of writing it by hand."
sidebar:
  label: "Generate from OpenAPI"
---

## Overview

If you already have an [OpenAPI specification](https://swagger.io/specification/), you can generate the contract with [Hey API](https://heyapi.dev/)'s `orpc` plugin instead of defining it manually. Each operation in the specification becomes a [procedure contract](/docs/contract/procedure) with its route, input, and output.

:::warning
The Hey API `orpc` plugin is currently beta and may introduce breaking changes while the integration stabilizes. Until the next stable Hey API release, oRPC v2 output requires the `next` release tag.
:::

## Example

Install Hey API:

```package-install
npm install -D @hey-api/openapi-ts@next
```

Create an `openapi-ts.config.ts` file pointing at your specification. It can be a local file or a URL:

```ts openapi-ts.config.ts
import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: 'https://get.heyapi.dev/hey-api/backend',
  output: 'src/contract',
  plugins: [
    {
      name: 'orpc',
      compatibilityVersion: '2',
      validator: 'zod',
    },
  ],
})
```

Then run:

```bash
npx @hey-api/openapi-ts
```

This writes `orpc.gen.ts` and `zod.gen.ts` to `src/contract`, with one procedure contract per operation and a `contract` router combining them all. In this example, `zod` generates the validation schemas:

```ts src/contract/orpc.gen.ts
import { oc } from '@orpc/contract'
import { openapi } from '@orpc/openapi'
import * as z from 'zod'

import { zAddPetBody, zAddPetResponse } from './zod.gen'

export const addPet = oc
  .meta(openapi({
    inputStructure: 'detailed',
    method: 'POST',
    path: '/pet',
    tags: ['pet'],
  }))
  .input(z.object({ body: zAddPetBody }))
  .output(zAddPetResponse)

export const contract = {
  addPet,
  // ...every other operation
}
```

The generated files import `@orpc/contract`, `@orpc/openapi`, and `zod`, so install them if you have not already:

```package-install
npm install @orpc/contract@beta @orpc/openapi@beta zod
```

For all configuration options and plugin behavior, see the [Hey API `orpc` plugin documentation](https://heyapi.dev/docs/openapi/typescript/plugins/orpc/v2).

## What To Do Next

Once the contract is generated, what you do next depends on how you want to use it:

- Implement the contract on your own server with [Contract Implementation](/docs/contract/implementation).
- Call an existing OpenAPI-compliant server through a typesafe client with [OpenAPI Link](/docs/openapi/link).
