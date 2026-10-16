---
title: "RPC Handler"
description: "Use RPCHandler to serve procedures over the RPC protocol, with HTTP method control, interceptors, plugins, custom serializers, and error responses."
---

## Overview

`RPCHandler` serves [RPC Link](/docs/rpc/link) clients, or any client that implements the [RPC protocol](/docs/rpc/protocol):

```ts
const handler = new RPCHandler(router, {
  interceptors: [
    async ({ next, path }) => {
      console.time(path.join('.'))

      try {
        return await next()
      }
      catch (err) {
        console.error(`${path.join('.')}:`, err)
        throw err
      }
      finally {
        console.timeEnd(path.join('.'))
      }
    }
  ],
  plugins: [
    new CORSHandlerPlugin()
  ],
})
```

:::info
The actual usage of `RPCHandler` depends on the adapter you use. For example, when using the fetch adapter, the handler is used like this:

```ts
export async function fetch(request: Request) {
  const { matched, response } = await handler.handle(request, {
    prefix: '/rpc',
    context: {} // <- provide initial context if needed
  })

  if (matched) {
    return response
  }

  return new Response('Not Found', { status: 404 })
}
```

:::

:::tip
`context` also accepts a sync or async function that receives the standard request. The handler only calls it once the request matches `prefix`, so work such as loading a session is skipped for requests that other routes serve:

```ts
const { matched, response } = await handler.handle(request, {
  prefix: '/rpc',
  context: async () => ({ session: await getSession(request) }),
})
```

:::

:::warning
To better support `Blob`, `File`, and `ReadableStream<Uint8Array>` at the root level in cross-origin scenarios,
extend your [CORS allowlist](https://developer.mozilla.org/en-US/docs/Glossary/CORS-safelisted_response_header) to allow clients to read the `Content-Disposition` and `Standard-Server` response headers. Learn more in the [Standard Server documentation](https://github.com/middleapi/standard-server#how-body-parsing-works). If you use the [CORS Plugin](/docs/plugins/cors), include them in `exposeHeaders`:

```ts
const cors = new CORSHandlerPlugin({
  exposeHeaders: ['Content-Disposition', 'Standard-Server'],
})
```

:::

## Supported HTTP Methods

By default, `RPCHandler` only responds to `POST`, `PUT`, `PATCH`, and `DELETE` requests. Any other method, such as `GET` or `HEAD`, is treated as unmatched, as if no procedure exists at that path.

This is a security default: cross-site, browsers can only send these methods via a [CORS preflight](https://developer.mozilla.org/en-US/docs/Glossary/Preflight_request) or an HTML form, never from a plain link. Safe methods like `GET` or `HEAD` are excluded because invoking a procedure can modify data.

Use `allowMethods` to replace the allowlist: tighten it to `POST` only, or also accept [`QUERY`](https://datatracker.ietf.org/doc/draft-ietf-httpbis-safe-method-w-body/), which reads input from the request body and stays preflight-protected:

```ts
const handler = new RPCHandler(router, {
  allowMethods: ['POST', 'PUT', 'PATCH', 'DELETE', 'QUERY'],
})
```

### Enabling the GET Method

:::danger[Dangerous with cookie-based authentication]
Enabling `GET` is dangerous when your application stores tokens in cookies not marked `SameSite=Strict`. These cookies **are still sent on cross-site top-level navigations**, so an attacker only needs a signed-in user to click a link like `https://example.com/rpc/planet/delete?data=...` and the procedure runs with the victim's cookies. No JavaScript, no CORS bypass.

To enable `GET` safely, do one of the following:

- Set authentication cookies to `SameSite=Strict`, which browsers never send cross-site
- Use an independent protection, such as the [GET Method CSRF Protection Plugin](/docs/plugins/get-method-csrf-protection)
- Allow `GET` only for safe procedures that never modify data, as shown below

Learn more about this attack on [MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF) and in the [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
:::

Add `GET` to `allowMethods` to enable it for every procedure:

```ts
import { GetMethodCsrfProtectionHandlerPlugin } from '@orpc/server/plugins'
import { RPC_DEFAULT_ALLOW_METHODS } from '@orpc/server/standard'

const handler = new RPCHandler(router, {
  allowMethods: ['GET', ...RPC_DEFAULT_ALLOW_METHODS],
  plugins: [
    new GetMethodCsrfProtectionHandlerPlugin(), // reject GET navigations that may carry SameSite=Lax cookies
  ],
})
```

The plugin rejects the navigations another site can use to send `SameSite=Lax` cookies, such as link clicks and redirects, while cookie-less requests such as `fetch` keep working. See the [GET Method CSRF Protection Plugin](/docs/plugins/get-method-csrf-protection) page for its cookie requirements.

Or pass a function to decide per request. For example, only allow `GET` for procedures that declare it via [OpenAPI metadata](/docs/openapi/routing):

```ts
import { getOpenAPIMeta, openapi } from '@orpc/openapi'
import { RPC_DEFAULT_ALLOW_METHODS } from '@orpc/server/standard'

const listPlanets = os
  .meta(openapi({ method: 'GET', path: '/planets' }))
  .handler(() => ['Earth', 'Mars'])

const handler = new RPCHandler({ listPlanets }, {
  allowMethods: (method, procedure, path) => {
    if (method === 'GET' && getOpenAPIMeta(procedure)?.method === 'GET') {
      return true
    }

    return RPC_DEFAULT_ALLOW_METHODS.includes(method)
  },
})
```

## Interceptors

Interceptors let you observe or change different stages of an RPC request. Common use cases include logging, error handling, and metrics.

### Routing Interceptors

Routing interceptors run on every request before routing. Use them when you need to handle all requests, including requests that do not match a procedure.

```ts
const handler = new RPCHandler(router, {
  routingInterceptors: [
    async ({ next, request, context }) => {
      if (condition) {
        return { matched: false }
      }

      const { matched, response } = await next()
      return { matched, response }
    },
  ],
})
```

### Interceptors

These interceptors run only for matched requests, after routing and before error handling (but can't use `ORPCError` for [typesafe errors](/docs/error-handling#orpcerror-compatibility)). Use them when you need access to the matched procedure.

:::tip
In most cases, `interceptors` are the best choice. They provide more context, are easier to work with, and run before error handling.
:::

```ts
const handler = new RPCHandler(router, {
  interceptors: [
    async ({ next, request, procedure, context }) => {
      try {
        const response = await next()
        return response
      }
      catch (err) {
        if (err instanceof CustomError) {
          throw new ORPCError('CUSTOM_ERROR', { message: err.message, cause: err })
        }

        throw err
      }
    },
    async ({ next, path }) => {
      console.time(path.join('.'))

      try {
        const response = await next()
        return response
      }
      catch (err) {
        console.error(`${path.join('.')}:`, err)
        throw err
      }
      finally {
        console.timeEnd(path.join('.'))
      }
    },
  ],
})
```

### Client Interceptors

Client interceptors run only for matched requests, after input decoding, before output encoding and can use `ORPCError` for [typesafe errors](/docs/error-handling#orpcerror-compatibility). Use them when you need access to the procedure, input, and output.

```ts
const handler = new RPCHandler(router, {
  clientInterceptors: [
    async ({ next, input, context, procedure }) => {
      const output = await next()
      return output
    },
  ],
})
```

## Plugins

Plugins package reusable interceptors. For example, [CORS Plugin](/docs/plugins/cors) adds a [routing interceptor](#routing-interceptors) to handle preflight requests and adds CORS headers to every response.

```ts
const handler = new RPCHandler(router, {
  plugins: [
    new CORSHandlerPlugin()
  ],
})
```

## Custom Serializer

`RPCHandler` uses a built-in serializer that supports many native types. Provide a custom serializer when you need extra types or different encoding behavior. For more details, see [RPC Serializer](/docs/rpc/serializer).

```ts
const handler = new RPCHandler(router, {
  serializer: new RPCSerializer({
    handlers: {
      // ...custom handlers
    },
  }),
})
```

## Filtering Procedures

Use the `filter` option to exclude procedures from matching:

```ts
const handler = new RPCHandler(router, {
  filter: (contract, path) => getIsInternalMeta(contract) !== true,
})
```

## Custom Error Response

By default, `RPCHandler` uses `COMMON_ERROR_STATUS_MAP` to determine response status codes. Use `errorStatusMap` to customize them:

```ts
import { COMMON_ERROR_STATUS_MAP } from '@orpc/server'

const handler = new RPCHandler(router, {
  /**
   * The status code should be in the `4xx` or `5xx` range (must be greater than or equal to `400`).
   */
  errorStatusMap: {
    ...COMMON_ERROR_STATUS_MAP,
    CUSTOM_ERROR: 599,
  },
})
```

<Expandable title="Common Error Status Map">

| Error Code             | HTTP Status Code |
| ---------------------- | ---------------: |
| BAD_REQUEST            |              400 |
| UNAUTHORIZED           |              401 |
| PAYMENT_REQUIRED       |              402 |
| FORBIDDEN              |              403 |
| NOT_FOUND              |              404 |
| METHOD_NOT_SUPPORTED   |              405 |
| NOT_ACCEPTABLE         |              406 |
| TIMEOUT                |              408 |
| CONFLICT               |              409 |
| GONE                   |              410 |
| LENGTH_REQUIRED        |              411 |
| PRECONDITION_FAILED    |              412 |
| PAYLOAD_TOO_LARGE      |              413 |
| UNSUPPORTED_MEDIA_TYPE |              415 |
| UNPROCESSABLE_CONTENT  |              422 |
| PRECONDITION_REQUIRED  |              428 |
| TOO_MANY_REQUESTS      |              429 |
| CLIENT_CLOSED_REQUEST  |              499 |
| INTERNAL_SERVER_ERROR  |              500 |
| NOT_IMPLEMENTED        |              501 |
| BAD_GATEWAY            |              502 |
| SERVICE_UNAVAILABLE    |              503 |
| GATEWAY_TIMEOUT        |              504 |

</Expandable>

## Event Stream Options

Configure how an [AsyncIteratorObject](/docs/async-iterator-object) is streamed to the client. Available options depend on the adapter. For example, the fetch adapter supports:

```ts
const handler = new RPCHandler(router, {
  toFetchResponse: {
    eventStream: {
      initialComment: {
        /**
         * If true, an initial comment is sent immediately upon stream start to flush headers.
         * This allows the receiving side to establish the connection without waiting for the first event.
         *
         * @default true
         */
        enabled: true,
        /**
         * The content of the initial comment sent upon stream start. Must not include newline characters.
         *
         * @default ''
         */
        comment: '',
      },
      keepAlive: {
        /**
         * If true, a ping comment is sent periodically to keep the connection alive.
         *
         * @default true
         */
        enabled: true,
        /**
         * Interval (in milliseconds) between ping comments sent after the last event.
         *
         * @default 15000
         */
        interval: 15000,
        /**
         * The content of the ping comment. Must not include newline characters.
         *
         * @default ''
         */
        comment: '',
      },
    },
  },
})
```

## Lifecycle

The diagram below shows how a request flows through `RPCHandler` and where each interceptor type runs:

```mermaid
sequenceDiagram
  actor Client
  participant Adapter as Adapter (Fetch, Node, ...)
  participant Handler as RPCHandler
  participant Procedure as Server-Side Procedure Client

  Client ->> Adapter: request
  Adapter ->> Handler: standard request
  Note over Handler: routingInterceptors
  Handler ->> Handler: find matching procedure
  Handler -->> Adapter: if not matched
  Note over Handler: interceptors
  Handler ->> Handler: decode input
  Handler ->> Procedure: input, signal, lastEventId, ...
  Note over Procedure: clientInterceptors
  Procedure ->> Procedure: execute procedure
  Procedure ->> Handler: output or error
  Handler ->> Handler: encode output or error
  Handler ->> Adapter: standard response
  Adapter ->> Client: response
```

:::info
The server-side procedure client follows the [Server-Side Client Lifecycle](/docs/client/server-side#lifecycle), and `clientInterceptors` behave like server-side client `interceptors`.
:::
