<p align="center">
  <a href="https://trpc.io/"><img src="../../www/static/img/logo-text.svg" alt="tRPC" height="130"/></a>
</p>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

<p align="center">
  <!-- TODO: replace with new version GIF -->
  <img src="https://storage.googleapis.com/trpc/trpcgif.gif" alt="Demo" />
</p>

# `@trpc/react`

> The `@trpc/react` package is responsible for connecting a trpc server to a react application.

## Documentation

Full documentation for `@trpc/react` can be found [here](https://trpc.io/docs/react-queries)

## Installation

```bash
# NPM
npm install @trpc/react react-query

# Yarn
yarn add @trpc/react react-query

# Pnpm
pnpm install @trpc/react react-query
```

## Basic Example

Create a trpc utils file that exports react hooks and providers.

```typescript
import { createReactQueryHooks, createReactQueryHooksProxy } from '@trpc/react';
import type { AppRouter } from './server';

export const trpc = createReactQueryHooks<AppRouter>();
export const proxy = createReactQueryHooksProxy(trpc);
```

Use the trpc provider to connect to the trpc server url.

```typescript
import React from 'react';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { trpc } from './utils/trpc';

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

```typescript
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
