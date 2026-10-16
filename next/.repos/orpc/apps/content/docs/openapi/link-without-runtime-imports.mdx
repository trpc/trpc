---
title: "OpenAPI Link Without Runtime Imports"
description: "Use build-time macros to embed a minified contract in your client bundle, so OpenAPI Link works without maintaining a separate contract or shipping server code to the client."
---

[OpenAPI Link](/docs/openapi/link) needs a contract at runtime to know each procedure's method and path. With [RPC Link](/docs/rpc/link) a type import is enough, but with OpenAPI Link you must either maintain a [contract](/docs/contract/router) or import your [router](/docs/router), which pulls server code into the client bundle. [Safely Importing Router on the Client](/docs/contract/router#safely-importing-router-on-the-client) avoids that by exporting a minified contract to a JSON file, but you must regenerate the file every time the router changes.

Macros remove that manual step. A macro is a function your bundler runs at build time, replacing the call with its return value. [Bun supports macros natively](https://bun.com/docs/bundler/macros), and [unplugin-macros](https://github.com/unplugin/unplugin-macros) brings the same syntax to Vite, Rollup, webpack, esbuild, and Rspack. With a macro that returns the minified contract, every build embeds an up-to-date contract in the client bundle, and server code never leaves the server.

## Setup

If you bundle with Bun, macros work out of the box. For other bundlers, install [unplugin-macros](https://github.com/unplugin/unplugin-macros) and register it. For example, with Vite:

```ts vite.config.ts
import Macros from 'unplugin-macros/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [Macros()],
})
```

## Export the Contract from a Macro

Define a function that derives the minified contract from your router:

```ts contract.ts
import { minifyRouterContract, RouterContract } from '@orpc/contract'
import { unlazyRouter } from '@orpc/server'
import { router } from './router'

export async function getMinifiedContract(): Promise<RouterContract> {
  return minifyRouterContract(await unlazyRouter(router))
}
```

- `unlazyRouter` resolves any [lazy routers](/docs/router#lazy-router) so the whole router can be minified.
- `minifyRouterContract` preserves only the metadata the client needs; schemas and handlers are stripped out.

## Create the Link

Import the function with the `{ type: 'macro' }` attribute and pass its result to `OpenAPILink`:

```ts
import type { JsonifiedClient } from '@orpc/openapi'
import type { RouterClient } from '@orpc/server'
import type { router } from './router'
import { createORPCClient } from '@orpc/client'
import { OpenAPILink } from '@orpc/openapi/fetch'
import { getMinifiedContract } from './contract.ts' with { type: 'macro' } // [!code highlight]

const link = new OpenAPILink(await getMinifiedContract(), {
  origin: 'https://api.example.com',
  url: '/api',
})

const client: JsonifiedClient<RouterClient<typeof router>> = createORPCClient(link)
```

The `router` import is type-only, so it is erased at compile time and never reaches the bundle. The bundler calls `getMinifiedContract` at build time and inlines the result, so the bundle contains only plain JSON data:

```js
const link = new OpenAPILink({
  planet: {
    find: { '~orpc': { errorMap: {}, meta: { '~openapi': { method: 'GET', path: '/planets/{id}' } } } },
  },
  // ...
})
```

:::info
unplugin-macros resolves the macro module with Node's module rules, so the relative import must include the real `.ts` extension. Bun works with or without it. Enable `allowImportingTsExtensions` in your `tsconfig.json` if TypeScript rejects the extension.
:::
