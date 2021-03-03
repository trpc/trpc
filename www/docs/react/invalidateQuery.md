---
id: invalidateQuery
title: invalidateQuery
sidebar_label: invalidateQuery()
slug: /invalidateQuery
---


A type safe wrapper around calling `queryClient.invalidateQueries()`, all it does is to call `queryClient.invalidateQueries()` with the passed args. [See react-query docs](https://react-query.tanstack.com/guides/query-invalidation) if you want more fine-grained control.



## Example code

```tsx
import { trpc } from '../utils/trpc'

const mutation = trpc.useMutation('editPost', {
  onSuccess(input) {
    queryClient.invalidateQuery(['allPosts']);
    queryClient.invalidateQuery(['postById', input.id]);
  },
})
```

