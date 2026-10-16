---
title: "Publish Client to NPM"
description: "Learn how to build and publish your oRPC client to NPM so users can consume your APIs as a fully typed SDK."
---

:::info
Before you start, we recommend watching some [publish typescript library to npm tutorials](https://www.youtube.com/results?search_query=publish+typescript+library+to+npm) to get familiar with the process.
:::

## Prerequisites

You must have a project already set up with oRPC. [Contract First](/docs/contract-first) is the preferred approach. If you haven't set one up yet, you can clone an [oRPC playground](/docs/playgrounds) and start from there.

:::info
In this guide, we'll use [pnpm](https://pnpm.io/) as the package manager and [tsdown](https://tsdown.dev/) for bundling the package. You can use other package managers and bundlers, but the commands may differ.
:::

## Export & Scripts

First, create a `src/index.ts` file to set up and export your client.

```ts src/index.ts
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterContractClient } from '@orpc/contract'

export function createMyApi(apiKey: string): RouterContractClient<typeof contract> {
  const link = new RPCLink({
    origin: 'https://example.com',
    url: '/rpc',
    headers: {
      'x-api-key': apiKey,
    }
  })

  return createORPCClient(link)
}
```

:::info
This example uses [RPC Link](/docs/rpc/link) combined with [Contract First](/docs/contract-first) to create a client. This is just an example, you can use any other link or client setup that you prefer.
:::

Next, configure your `package.json` with the necessary fields for publishing to NPM.

```json package.json
{
  "name": "<package-name>", // [!code highlight]
  "type": "module",
  "version": "0.0.0", // [!code highlight]
  "publishConfig": {
    "access": "public" // [!code highlight]
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts", // [!code highlight]
      "import": "./dist/index.js", // [!code highlight]
      "default": "./dist/index.js" // [!code highlight]
    }
  },
  "files": [
    "dist" // [!code highlight]
  ],
  "scripts": {
    "build": "tsdown --dts src/index.ts", // [!code highlight]
    "release": "pnpm publish" // [!code highlight]
  },
  "dependencies": {
    "@orpc/client": "...", // [!code highlight]
    "@orpc/contract": "..." // [!code highlight]
    // ... other dependencies that `src/index.ts` depends on
  },
  "devDependencies": {
    "tsdown": "latest",
    "typescript": "latest"
  }
}
```

## Build & Publish

After completing the necessary setup, commit your changes and run the following commands to build and publish your client to NPM:

```bash
pnpm login # if you haven't logged in yet
pnpm run build
pnpm run release
```

## Install & Use

Once your client is published to NPM, you can install it in your project and use it like this:

```bash
pnpm add "<package-name>"
```

```ts example.ts
import { createMyApi } from '<package-name>'

const myApi = createMyApi('your-api-key')

const output = await myApi.someMethod('input')
```

:::info
This client includes all oRPC client features, so you can use it with any supported integrations like [Tanstack Query](/docs/integrations/tanstack-query).
:::
