---
id: error-formatting
title: Error Formatting
sidebar_label: Error Formatting
slug: /error-formatting
---

You can do custom error formatting in your router and the returned object will be inferred all the way to your client (& React components)


## Working example

- Code at [/examples/next-hello-world/pages/api/trpc/\[trpc\].ts](https://github.com/trpc/trpc/blob/main/examples/next-hello-world/pages/api/trpc/%5Btrpc%5D.ts)
- Live at [hello-world.trpc.io](https://hello-world.trpc.io) (try submitting the form without filling in the input)


## Usage example highlighted

### Adding custom formatting

```ts

const router = trpc.router<Context>()
  .formatError(({ defaultShape, error }) => {
    return {
      ...defaultShape,
      zodError:
        error.code === 'BAD_USER_INPUT' &&
        error.originalError instanceof ZodError
          ? error.originalError.flatten()
          : null,
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

  if (mutation.error?.shape?.zodError) {
    // zodError will be inferred
    return (
      <pre>Error: {JSON.stringify(mutation.error.shape.zodError, null, 2)}</pre>
    );
  }
  return <>[...]</>;
}
```


## All properties sent to `formatError()`

```ts
{
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: undefined | TContext;
  defaultShape: DefaultErrorShape; // the default error shape
}
```

**`DefaultErrorShape`:**

```ts
export type DefaultErrorShape = {
  message: string;
  code: string;
  path?: string;
  stack?: string; // will be set if `process.env.NODE_ENV !== 'production'`
};
```