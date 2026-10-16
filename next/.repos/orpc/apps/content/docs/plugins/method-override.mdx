---
title: "Method Override Plugin"
description: "Use MethodOverrideHandlerPlugin to override the HTTP method of a POST request with a query parameter, so HTML forms can invoke PUT, PATCH, and DELETE procedures."
sidebar:
  label: "Method Override"
---

## How It Works

HTML forms only support the GET and POST methods. When a POST request carries a `method` query parameter with an allowed value, the plugin routes the request as if it used that method and removes the parameter before input decoding. Values outside the allowed list are ignored and the request is processed as a regular POST.

```html
<form method="post" action="/api/todos/1?method=DELETE">
  <button>Delete todo</button>
</form>
```

## Setup

```ts
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { MethodOverrideHandlerPlugin } from '@orpc/server/plugins'

const handler = new OpenAPIHandler(router, {
  plugins: [
    new MethodOverrideHandlerPlugin({
      /**
       * The query parameter carrying the override method.
       *
       * @default 'method'
       */
      param: 'method',

      /**
       * The methods a POST request may be overridden to.
       *
       * GET and HEAD are excluded by default because they switch input decoding
       * from the request body to the query string and widen the CSRF surface.
       *
       * @default ['PUT', 'PATCH', 'DELETE']
       */
      methods: ['PUT', 'PATCH', 'DELETE'],
    }),
  ],
})
```

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or a custom one. The plugin is most useful with [OpenAPIHandler](/docs/openapi/handler), where the HTTP method decides which procedure a request matches.
:::

## Learn More

For implementation details, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/server/src/plugins/method-override.ts).
