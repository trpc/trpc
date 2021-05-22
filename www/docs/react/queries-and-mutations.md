---
id: queries-and-mutations
title: Queries & Mutations
sidebar_label: Queries & Mutations
slug: /react-queries-and-mutations
---

## Read this first

In general, tRPC's queries and mutations are a tiny wrapper around react-query, so have a look at their docs for [Queries](https://react-query.tanstack.com/guides/queries) or [Mutations](https://react-query.tanstack.com/guides/mutations) for in-depth information about all the options.

Here we are focusing outlining the small differences.

## Queries

You pass a `[path, input]`-tuple as the first argument. You'll notice that you get autocompletion on the `path` and automatic type safety on the `input`.

If an `input`-argument is optional, you can omit the `, input` part of the argument.

### Example

<details><summary>Backend code</summary>

```tsx
import * as trpc from '@trpc/server';
import { z } from 'zod';

trpc.router()
  // Create procedure at path 'hello'
  .query('hello', {
    // using zod schema to validate and infer input values
    input: z
      .object({
        text: z.string().optional(),
      })
      .optional(),
    resolve({ input }) {
      return {
        greeting: `hello ${input?.text ?? 'world'}`,
      };
    },
  })
```
</details>


```tsx
import { trpc } from '../utils/trpc';

export function MyComponent() {
  // input is optional, so we don't have to pass second argument
  const helloNoArgs = trpc.useQuery(['hello']);
  const helloWithArgs = trpc.useQuery(['hello', { text: 'client' }]);

  return (
    <div>
      <h1>Hello World Example</h1>
      <ul>
        <li>
          helloNoArgs ({helloNoArgs.status}):{' '}
          <pre>{JSON.stringify(helloNoArgs.data, null, 2)}</pre>
        </li>
        <li>
          helloWithArgs ({helloWithArgs.status}):{' '}
          <pre>{JSON.stringify(helloWithArgs.data, null, 2)}</pre>
        </li>
      </ul>
    </div>
  );
}
```



## Mutations


Works like react-query's mutations - [see their docs](https://react-query.tanstack.com/guides/mutations).

If you have an optional input argument you'll have to pass `null` or `undefined` as the input - [see this discussion for more details](https://github.com/trpc/trpc/issues/390).

### Example

<details><summary>Backend code</summary>

```tsx
import * as trpc from '@trpc/server';
import { z } from 'zod';

trpc.router()
  // Create procedure at path 'login'
  // The syntax is identical to creating queries
  .mutation('login', {
    // using zod schema to validate and infer input values
    input: z
      .object({
        name: z.string(),
      })
    async resolve({ input }) {
      // Here some login stuff would happen
      
      return {
        user: {
          name: input.name,
          role: 'ADMIN'
        },
      };
    },
  })
```
</details>


```tsx
import { trpc } from '../utils/trpc';

export function MyComponent() {
  // Note! This is not a tuple ['login', ...] but a string 'login'
  const login = trpc.useMutation('login');
  
  const handleLogin = async () => {
    const name = 'John Doe'
    
    await login.mutateAsync({ name })
  }

  return (
    <div>
      <h1>Login Form</h1>
      <button onClick={handleLogin}>Login</button>
    </div>
  );
}
```
