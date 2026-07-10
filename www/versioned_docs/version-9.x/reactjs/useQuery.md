---
id: queries
title: useQuery()
sidebar_label: useQuery()
slug: /react-queries
---

> The hooks provided by `@trpc/react` are a thin wrapper around React Query. For in-depth information about options and usage patterns, refer to their docs on [Queries](https://tanstack.com/query/v3/docs/react/guides/queries).

```tsx
function useQuery(
  pathAndInput: [string, TInput?],
  opts?: UseTRPCQueryOptions;
)
```

The first argument is a `[path, input]`-tuple - if the `input` is optional, you can omit the `, input`-part.

You'll notice that you get autocompletion on the `path` and automatic typesafety on the `input`.

### Example

<details>
<summary>Backend code</summary>

```tsx title='server/routers/_app.ts'
import * as trpc from '@trpc/server';
import { z } from 'zod';

export const appRouter = trpc
  .router()
  // Create procedure at path 'hello'
  .query('hello', {
    // using zod schema to validate and infer input values
    input: z
      .object({
        text: z.string().nullish(),
      })
      .nullish(),
    resolve({ input }) {
      return {
        greeting: `hello ${input?.text ?? 'world'}`,
      };
    },
  });
```

</details>

```tsx title='components/MyComponent.tsx'
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
