---
id: disabling-queries
title: Disabling Queries
sidebar_label: Disabling Queries
slug: /client/react/disabling-queries
---

To disable queries, you can pass `skipToken` as the first argument to `useQuery` or `useInfiniteQuery`. This will prevent the query from being executed.

### Typesafe conditional queries using `skipToken`

```tsx
import { skipToken } from '@tanstack/react-query';


export function MyComponent() {

const [name, setName] = useState<string | undefined>();

const result = trpc.getUserByName.useQuery(name ? { name: name } : skipToken);

  return (
    ...
  )
}
```
