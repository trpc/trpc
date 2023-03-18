---
id: introduction
title: tRPC Client
sidebar_label: Introduction
slug: /client/introduction
---

# tRPC Client

The "vanilla" tRPC client can be used to call your API procedures as if they are local functions, enabling a seamless development experience.

```ts
import type { AppRouter } from '../path/to/server/trpc';

const bilbo = await client.getUser.query('id_bilbo');
// => { id: 'id_bilbo', name: 'Bilbo' };
```

### When to use the tRPC Client?

You are likely to use this client in two scenarios:

- With a frontend framework which we don't have an official integration with
- With a separate backend service written in Typescript.

### When **NOT** to use the tRPC Client?

We recommend you do not use this client when calling procedures of the same API instance, this is because the invocation has to pass through the network layer. For complete recommendations on invoking a procedure in the current API, you can [read more here](/docs/server-side-calls).
