---
id: vanilla
title: Vanilla client
sidebar_label: Create Vanilla Client
slug: /vanilla
---

The magic of tRPC is making _strongly typed_ API calls without relying on code generation. With full-stack TypeScript projects, you can directly _import types from the server into the client_! This is a vital part of how tRPC works.

Import the `AppRouter` type into your client from the file your root tRPC router is defined. This single type represents the type signature of your entire API.

```ts title='client.ts'
import type { AppRouter } from '../path/to/server/trpc';
```

The `import type` keywords let you import from _any TypeScript file_ on your filesystem. Plus `import type` can only import types, **NOT** code. So there's no danger of accidentally importing server-side code into your client. All calls to `import type` are _always fully erased_ from your compiled JavaScript bundle ([source](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export)).

### Initialize a tRPC client

Create a typesafe client with the `createTRPCClient` method from `@trpc/client`:

```ts title='client.ts'
// pages/index.tsx
import { createTRPCClient } from '@trpc/client';
import type { AppRouter } from '../path/to/server/trpc';

const client = createTRPCClient<AppRouter>({
  url: 'http://localhost:5000/trpc',
});
```

As you can see, we passed `AppRouter` as a **type argument** of `createTRPCClient`. This returns a strongly typed `client` instance:

```ts title='client.ts'
const bilbo = await client.query('getUser', 'id_bilbo');
// => { id: 'id_bilbo', name: 'Bilbo' };

const frodo = await client.mutation('createUser', { name: 'Frodo' });
// => { id: 'id_frodo', name: 'Frodo' };
```
