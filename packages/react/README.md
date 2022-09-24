<p align="center">
  <a href="https://trpc.io/"><img src="../../www/static/img/logo-text.svg" alt="tRPC" height="130"/></a>
</p>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

<p align="center">
  <img src="https://assets.trpc.io/www/v10/preview-dark.gif" alt="Demo" />
</p>

# `@trpc/react`

> Connect a tRPC server to React.

## Documentation

Full documentation for `@trpc/react` can be found [here](https://trpc.io/docs/react-queries)

## Installation

```bash
# npm
npm install @trpc/react@next @tanstack/react-query

# Yarn
yarn add @trpc/react@next @tanstack/react-query

# pnpm
pnpm add @trpc/react@next @tanstack/react-query
```

## Basic Example

Create a utils file that exports tRPC hooks and providers.

```ts
import { createReactQueryHooks, createTRPCReact } from '@trpc/react';
import type { AppRouter } from './server';

export const trpc = createTRPCReact<AppRouter>();
```

Use the provider to connect to your API.

```ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useState } from 'react';
import { trpc } from '~/utils/trpc';

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      url: 'http://localhost:5000/trpc',
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

Now in any component, you can query your API using the proxy exported from the utils file.

```ts
import { proxy } from '~/utils/trpc';

export function Hello() {
  const { data, error, status } = proxy.greeting.useQuery({ name: 'tRPC' });

  if (error) {
    return <p>{error.message}</p>;
  }

  if (status !== 'success') {
    return <p>Loading...</p>;
  }

  return <div>{data && <p>{data.greeting}</p>}</div>;
}
```
