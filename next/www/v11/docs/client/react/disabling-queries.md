---
title: "Disabling Queries"
description: ""
section: "Client Usage"
parent: "client/react"
order: 67
---

To disable queries, you can pass `skipToken` as the first argument to `useQuery`, `useInfiniteQuery`, and `useSubscription`. This will prevent the query from being executed.

### Typesafe conditional queries using `skipToken`

```tsx
import React, { useState } from 'react';
import { skipToken } from '@tanstack/react-query';
import { trpc } from './utils/trpc';

export function MyComponent() {
  const [name, setName] = useState<string | undefined>();

  const result = trpc.getUserByName.useQuery(name ? { name: name } : skipToken);

  return (
    <div>{result.data?.name}</div>
  );
}
```
