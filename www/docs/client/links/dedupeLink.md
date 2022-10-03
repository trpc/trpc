---
id: dedupe
title: Dedupe Link
sidebar_label: Dedupe Link
slug: /links/dedupe
---

`dedupeLink` is a link that allows you to remove duplicate tRPC operations. It's helpful in times where **TODO: add justification for dedupeLink**.

## Usage

You can import and add the `dedupeLink` to the `links` array as such:

```ts title="client/index.ts"
import { createTRPCProxyClient, dedupeLink, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    dedupeLink(),
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
  ],
});
```
