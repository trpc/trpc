---
id: introduction
title: tRPC Client
sidebar_label: Introduction
slug: /client/vanilla
---

# tRPC Client

The "Vanilla" tRPC client can be used to call your API procedures as if they are local functions, enabling a seamless development experience.

```ts
import type { AppRouter } from '../path/to/server/trpc';

const bilbo = await client.getUser.query('id_bilbo');
// => { id: 'id_bilbo', name: 'Bilbo' };
```

### When to use the Vanilla Client?

You are likely to use this client in two scenarios:

- With a frontend framework for which we don't have an official integration
- With a separate backend service written in TypeScript.

### When **NOT** to use the Vanilla Client?

- While you _can_ use the client to call procedures from a React component, you should usually use our [React Query Integration](../react/introduction.mdx). It offers many additional features such as the ability to manage loading and error state, caching, and invalidation.
- We recommend you do not use this client when calling procedures of the same API instance, this is because the invocation has to pass through the network layer. For complete recommendations on invoking a procedure in the current API, you can [read more here](/docs/server/server-side-calls).

## Handling TRPCClientError on the Client

When using tRPC on the client side, you may encounter errors when making API calls. These errors are represented by the `TRPCClientError` class, which differs from `TRPCError`, a server-side error. This section explains how to handle `TRPCClientError` effectively in different client environments.

### What is `TRPCClientError`?

`TRPCClientError` is an error type thrown when a request to the tRPC server fails due to various reasons, such as:

- Network issues (e.g., server unavailable, timeouts)
- Unauthorized requests (e.g., authentication failure, permission denied)
- Invalid input data (e.g., missing required parameters)
- API errors returned from the server

Unlike `TRPCError`, which is only accessible on the server, `TRPCClientError` allows you to handle errors gracefully on the client side.

### Basic Error Handling using `try-catch`

To handle errors when calling tRPC procedures manually, use a `try-catch` block:

```ts
import { TRPCClientError } from '@trpc/client';

async function fetchUser() {
  try {
    const user = await client.getUser.query('id_bilbo');
    console.log('User data:', user);
  } catch (error) {
    if (error instanceof TRPCClientError) {
      console.error('tRPC Client Error:', error.message);
    } else {
      console.error('Unexpected error:', error);
    }
  }
}
```

### Handling `TRPCClientError` in React with useQuery

When using `@tanstack/react-query` with tRPC, errors are automatically caught. You can check if an error is an instance of `TRPCClientError` and display a proper UI message:

```ts
import { useQuery } from '@tanstack/react-query';

const { data, error } = useQuery({
  queryKey: ['getUser', 'id_bilbo'],
  queryFn: () => client.getUser.query('id_bilbo'),
});

if (error instanceof TRPCClientError) {
  return <p>Error: {error.message}</p>;
}

return <p>{data?.name}</p>;
```

### Extracting Additional Error Information

`TRPCClientError` contains additional properties that provide more context about the error:

```ts
try {
  await client.getUser.query('invalid_id');
} catch (error) {
  if (error instanceof TRPCClientError) {
    console.error('Error Code:', error.data?.code);
    console.error('Error Message:', error.message);
    console.error('Stack Trace:', error.stack);
  }
}
```

### Best Practices for Error Handling

- Use `try-catch` for manual API calls: Helps in catching errors when using the vanilla tRPC client.
- Check for `TRPCClientError` in UI components: Ensures that errors are properly displayed in the UI.
- Extract error details: Use `error.data?.code` for more granular error handling.
- Gracefully handle network failures: Consider implementing retry logic or fallbacks.

By properly handling `TRPCClientError`, you can improve user experience and make your tRPC-based applications more resilient.

### Type-safe Error Checking with Helper Function

To ensure type safety when checking for `TRPCClientError`, you can create a helper function:

```typescript
import { TRPCClientError } from '@trpc/client';
import type { AppRouter } from '~/server/routers/_app'

function isTRPCClientError<TRouter extends AnyRouter>(
  cause: unknown,
): cause is TRPCClientError<TRouter> {
  return cause instanceof TRPCClientError;
}
```

This helper function allows you to maintain type information from your router, which is particularly useful when working with error formatting:

```typescript
try {
  await client.getUser.query('invalid_id');
} catch (cause) {
  if (isTRPCClientError<AppRouter>(cause)) {
    // cause is now typed as TRPCClientError<AppRouter>
    // You get full type safety with your error formatter
    console.error('Error shape:', cause.shape);
    console.error('Error data:', cause.data);
  }
}
```

When you use custom error formatting as described in [Error Formatting](https://trpc.io/docs/server/error-formatting), this approach ensures you get proper typing for your error structure.


