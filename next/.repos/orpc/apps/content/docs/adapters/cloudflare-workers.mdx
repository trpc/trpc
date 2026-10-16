---
title: "Cloudflare Workers Adapter"
description: "Use oRPC on Cloudflare Workers through the Fetch API Adapter, with the compatibility flags that make request cancellation and unhandled rejections behave."
sidebar:
  label: "Cloudflare Workers"
---

[Cloudflare Workers](https://developers.cloudflare.com/workers/) follow the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), so oRPC integrates through the [Fetch API Adapter](/docs/adapters/fetch-api).

## Basic

<CodeGroup>

```ts RPC
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { CORSHandlerPlugin } from '@orpc/server/plugins'

const handler = new RPCHandler(router, {
  plugins: [
    new CORSHandlerPlugin()
  ],
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

export default {
  async fetch(request, env, ctx) {
    const { matched, response } = await handler.handle(request, {
      prefix: '/rpc',
      context: { env, ctx } // Provide initial context if needed, can be an async function
    })

    if (matched) {
      return response
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
```

```ts OpenAPI
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { onError } from '@orpc/server'
import { CORSHandlerPlugin } from '@orpc/server/plugins'

const handler = new OpenAPIHandler(router, {
  plugins: [
    new CORSHandlerPlugin()
  ],
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

export default {
  async fetch(request, env, ctx) {
    const { matched, response } = await handler.handle(request, {
      prefix: '/api',
      context: { env, ctx } // Provide initial context if needed, can be an async function
    })

    if (matched) {
      return response
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
```

</CodeGroup>

## Compatibility Flags

oRPC forwards `request.signal` to every procedure call so handlers can stop work when the client disconnects. Workers only abort that signal when the [`enable_request_signal`](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#enable-requestsignal-for-incoming-requests) flag is set, so add it to your Wrangler configuration:

```jsonc title="wrangler.jsonc"
{
  "compatibility_date": "2026-07-01",
  "compatibility_flags": ["enable_request_signal"]
}
```

If your `compatibility_date` is before `2026-03-03`, also add [`unhandled_rejection_after_microtask_checkpoint`](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#defer-unhandled-rejection-processing-to-after-microtask-checkpoint). Without it, Workers can report false `unhandledrejection` errors for promises that are handled a microtask later.

## Traces

Use the [Cloudflare Workers Traces integration](/docs/integrations/cloudflare-traces) to record oRPC spans in Workers Traces.
