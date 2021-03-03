---
id: data-transformers
title: Data Transformers
sidebar_label: Data Transformers
slug: /data-transformers
---

You are able to serialize the response data & input args (in order to be able to transparently use e.g. standard `Date`s). The transformers need to be added both to the server and the client.


## Working Example

- `createNextApiHandler()` in [`./examples/next-ssg-chat/[trpc.ts]`](https://github.com/trpc/trpc/tree/main//examples/next-ssg-chat/pages/api/trpc/%5Btrpc%5D.ts), and
- `createTRPCClient` in [`./examples/next-ssg-chat/pages/_app.tsx`](https://github.com/trpc/trpc/tree/main//examples/next-ssg-chat/pages/_app.tsx)


