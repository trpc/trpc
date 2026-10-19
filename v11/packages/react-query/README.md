<p align="center">
  <a href="https://trpc.io/"><img src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg" alt="tRPC" height="75"/></a>
</p>

<h3 align="center">tRPC</h3>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

<p align="center">
  <img src="https://assets.trpc.io/www/v10/v10-dark-landscape.gif" alt="Demo" />
</p>

# `@trpc/react-query`

> A tRPC wrapper around react-query.

## Documentation

Full documentation for `@trpc/react-query` can be found [here](https://trpc.io/docs/react-query)

## Installation

```bash
# npm
npm install @trpc/react-query @tanstack/react-query

# Yarn
yarn add @trpc/react-query @tanstack/react-query

# pnpm
pnpm add @trpc/react-query @tanstack/react-query

# Bun
bun add @trpc/react-query @tanstack/react-query
```

## Basic Example

Create a utils file that exports tRPC hooks and providers.

```ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './server';

export const trpc = createTRPCReact<AppRouter>();
```

Use the provider to connect to your API.

```ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc } from '~/utils/trpc';
import React, { useState } from 'react';

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
import { trpc } from '~/utils/trpc';

export function Hello() {
  const { data, error, status } = trpc.greeting.useQuery({ name: 'tRPC' });

  if (error) {
    return <p>{error.message}</p>;
  }

  if (status !== 'success') {
    return <p>Loading...</p>;
  }

  return <div>{data && <p>{data.greeting}</p>}</div>;
}
```
