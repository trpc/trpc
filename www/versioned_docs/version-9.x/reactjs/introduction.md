---
id: introduction
title: Usage with React
sidebar_label: Usage with React
slug: /react
---

:::info

- If you're using Next.js, read the [Usage with Next.js](nextjs) guide instead.
- In order to infer types from your Node.js backend you should have the frontend & backend in the same monorepo.

:::

## Add tRPC to existing React project

### Server Side

#### 1. Install dependencies

```bash
yarn add @trpc/server zod
```

- Zod: most examples use [Zod](https://github.com/colinhacks/zod) for input validation and we highly recommended it, though it isn't required. You can use a validation library of your choice ([Yup](https://github.com/jquense/yup), [Superstruct](https://github.com/ianstormtaylor/superstruct), [io-ts](https://github.com/gcanti/io-ts), etc). In fact, any object containing a `parse`, `create` or `validateSync` method will work.

#### 2. Enable strict mode

If you want to use Zod for input validation, make sure you have enabled strict mode in your `tsconfig.json`:

```json
// tsconfig.json
{
  // ...
  "compilerOptions": {
    // ...
    "strict": true
  }
}
```

If strict mode is too much, at least enable `strictNullChecks`:

```json
// tsconfig.json
{
  // ...
  "compilerOptions": {
    // ...
    "strictNullChecks": true
  }
}
```

#### 3. Implement your `appRouter`

Follow the [Quickstart](quickstart) and read the [`@trpc/server` docs](router) for guidance on this. Once you have your API implemented and listening via HTTP, continue to the next step.

### Client Side

> tRPC works fine with Create React App!

#### 1. Install dependencies

```bash
yarn add @trpc/client @trpc/server @trpc/react react-query@3
```

- @trpc/server: This is a peer dependency of `@trpc/client` so you have to install it again!
- Tanstack's React Query: @trpc/react provides a thin wrapper over @tanstack/react-query. It is required as a peer dependency.

#### 2. Create tRPC hooks

Create a set of strongly-typed React hooks from your `AppRouter` type signature with `createReactQueryHooks`.

```tsx title='utils/trpc.ts'
// utils/trpc.ts
import { createReactQueryHooks } from '@trpc/react';
import type { AppRouter } from '../path/to/router.ts';

export const trpc = createReactQueryHooks<AppRouter>();
// => { useQuery: ..., useMutation: ...}
```

#### 3. Add tRPC providers

In your `App.tsx`

```tsx title='App.tsx'
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { trpc } from './utils/trpc';

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      url: 'http://localhost:5000/trpc',

      // optional
      headers() {
        return {
          authorization: getAuthCookie(),
        };
      },
    }),
  );
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {/* Your app here */}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

#### 4. Fetch data

```tsx title='pages/IndexPage.tsx'
import { trpc } from '../utils/trpc';

export default function IndexPage() {
  const hello = trpc.useQuery(['hello', { text: 'client' }]);
  if (!hello.data) return <div>Loading...</div>;
  return (
    <div>
      <p>{hello.data.greeting}</p>
    </div>
  );
}
```
