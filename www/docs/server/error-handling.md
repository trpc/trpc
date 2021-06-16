---
id: error-handling
title: Error Handling
sidebar_label: Error Handling
slug: /error-handling
---

If a procedure fails we trigger a function with information about the procedure & ctx.

## Example with Next.js

```ts
export default trpcNext.createNextApiHandler({
  // [...]
  onError({ error }) {
    console.error('Error:', error);
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting
    }
  },
});
```

## All properties sent to `onError()`


```ts
{
  error: TRPCError;
  type: 'query' | 'mutation' | 'subscription' | 'unknown';
  path: string | undefined; // path of the procedure that was triggered
  input: unknown;
  ctx: Context | undefined;
  req: BaseRequest; // request object
}
```

## Built-in error codes

> Following [JSON-RPC 2.0](https://www.jsonrpc.org/specification)

```jsx
{
  /**
   * Invalid JSON was received by the server.
   * An error occurred on the server while parsing the JSON text.
   */
  PARSE_ERROR: -32700,
  /**
   * The JSON sent is not a valid Request object.
   */
  BAD_REQUEST: -32600,
  /**
   * The method does not exist / is not available.
   */
  NOT_FOUND: -32601,
  /**
   * Internal JSON-RPC error.
   */
  INTERNAL_SERVER_ERROR: -32603,
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32003,
  METHOD_NOT_SUPPORTED: -32005,
  TIMEOUT: -32008,
  PAYLOAD_TOO_LARGE: -32013,
  CLIENT_CLOSED_REQUEST: -32099,
}
```

## Accessing original error

```ts
export default trpcNext.createNextApiHandler({
  // [...]
  onError({ error }) {
    console.error('Error:', error);
    console.log('Original error thrown', error.originalError);
  },
});
```


## Error helpers

```ts
import * as trpc from '@trpc/server';

// in your resolver:
throw trpc.httpError.unauthorized('Optional message') // --> 401
throw trpc.httpError.forbidden('Optional message')    // --> 403
throw trpc.httpError.badRequest('Optional message')   // --> 400
throw trpc.httpError.notFound('Optional message')     // --> 404
```
