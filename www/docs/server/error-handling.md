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
