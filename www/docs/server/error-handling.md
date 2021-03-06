---
id: error-handling
title: Error Handling
sidebar_label: Error Handling
slug: /error-handling
---

If a procedure fails we trigger an `onError()`-function with information about the procedure & ctx;

## Example with Next.js

```ts
export default trpcNext.createNextApiHandler({
  // [...]
  onError({ error }) {
    console.error('Error:', error);
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to analytics
    }
  },
});
```

## All properties sent to `onError()`

```ts
{
  error: TRPCError;
  procedureType: 'query' | 'mutation' 'subscription' | 'unknown';
  path: string | undefined; // path of the procedure that was triggered
  req: BaseRequest; // request object
  input: unknown;
  ctx: Context | undefined;
}
```

## Built-in error codes


| Code                    | HTTP Status | Description                                             |
| ----------------------- | ----------- | ------------------------------------------------------- |
| `BAD_USER_INPUT`        | 400         | Input validation failed                                 |
| `NOT_FOUND`             | 404         | Procedure path not found                                |
| `UNAUTHENTICATED`       | 401         | Unauthorized request                                    |
| `FORBIDDEN`             | 403         | Forbidden request                                       |
| `INTERNAL_SERVER_ERROR` | 500         | Something in the resolver threw an error                |
| `HTTP_ERROR`            | mixed       | `HTTPError` thrown, will grab statusCode from the error |


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
