---
id: create-react-app
title: Setting up Create React App, etc
sidebar_label: Create React App, etc
slug: /create-react-app
---

Your node-server needs to be in the same repo for the type inference easily.


## Steps

### 0. Install tRPC deps

```bash
yarn add @trpc/client @trpc/server @trpc/react zod react-query
```


### 1. Create tRPC hooks


Create `./src/utils/trpc.ts`

```tsx
import { createReactQueryHooks } from '@trpc/react';

// Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
import type { AppRouter } from '../server/trpc'; // <-- path to your backend server where your AppRouter is defined

export const trpc = createReactQueryHooks<AppRouter>();
```

### 2. Add tRPC providers

In your `App.tsx`

```tsx
import React from 'react';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { trpc } from './utils/trpc';

function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      url: '/api/trpc',
      getHeaders() {
        return {
          // authorization: '...',
        };
      }
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