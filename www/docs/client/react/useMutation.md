---
id: useMutation
title: useMutation()
sidebar_label: useMutation()
slug: /client/react/useMutation
---

:::note
The hooks provided by `@trpc/react-query` are a thin wrapper around @tanstack/react-query. For in-depth information about options and usage patterns, refer to their docs on [mutations](https://tanstack.com/query/v5/docs/framework/react/guides/mutations).
:::

Works like react-query's mutations - [see their docs](https://tanstack.com/query/v5/docs/framework/react/guides/mutations).

### Example

<details>
<summary>Backend code</summary>

```tsx title='server/routers/_app.ts'
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

export const appRouter = t.router({
  // Create procedure at path 'login'
  // The syntax is identical to creating queries
  login: t.procedure
    // using zod schema to validate and infer input values
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .mutation((opts) => {
      // Here some login stuff would happen
      return {
        user: {
          name: opts.input.name,
          role: 'ADMIN',
        },
      };
    }),
});
```

</details>

```tsx
import { trpc } from '../utils/trpc';

export function MyComponent() {
  const mutation = trpc.login.useMutation();

  const handleLogin = () => {
    const name = 'John Doe';

    mutation.mutate({ name });
  };

  return (
    <div>
      <h1>Login Form</h1>
      <button onClick={handleLogin} disabled={mutation.isPending}>
        Login
      </button>

      {mutation.error && <p>Something went wrong! {mutation.error.message}</p>}
    </div>
  );
}
```
