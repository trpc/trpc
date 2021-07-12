---
id: error-formatting
title: Error Formatting
sidebar_label: Error Formatting
slug: /error-formatting
---

You can do custom error formatting in your router and the returned object will be inferred all the way to your client (& React components)


## Usage example highlighted

### Adding custom formatting

```ts

const router = trpc.router<Context>()
  .formatError(({ shape, error }) => {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.code === 'BAD_USER_INPUT' &&
          error.originalError instanceof ZodError
            ? error.originalError.flatten()
            : null,
      };
    };
  })
```


### Usage in React

```tsx
function MyComponent() {
  const mutation = trpc.useMutation('addPost');

  useEffect(() => {
    mutation.mutate({ title: 'example' });
  }, []);

  if (mutation.error?.shape?.data.zodError) {
    // zodError will be inferred
    return (
      <pre>Error: {JSON.stringify(mutation.error.shape.data.zodError, null, 2)}</pre>
    );
  }
  return <>[...]</>;
}
```


## All properties sent to `formatError()`

> Since `v.8.x.` tRPC is compliant with [JSON-RPC 2.0](https://www.jsonrpc.org/specification)

```ts
{
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: undefined | TContext;
  shape: DefaultErrorShape; // the default error shape
}
```

**`DefaultErrorShape`:**

```ts

interface DefaultErrorData {
  code: TRPC_ERROR_CODE_KEY;
  path?: string;
  stack?: string;
}
interface DefaultErrorShape
  extends TRPCErrorShape<TRPC_ERROR_CODE_NUMBER, DefaultErrorData> {
  message: string;
  code: TRPC_ERROR_CODE_NUMBER;
}
```
