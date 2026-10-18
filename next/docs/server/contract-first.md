---
title: Contract-first
description: Describe procedures in a contract, implement them later, and type clients from the contract alone.
section: Server
order: 12
---

A contract describes procedures without implementing them. It lives in its own package, and clients and the OpenAPI generator accept it like a router.

```ts twoslash
// ---cut-start---
import { z } from 'zod';
import { PostSchema as Post } from './server.ts';
type Meta = { auth?: boolean };
const ById = z.object({ id: z.string() });
const NewPost = z.object({ title: z.string().min(1) });
// ---cut-end---
import { contract } from '@trpc12/trpc/contract';

const c = contract.create<{ meta: Meta }>().errors({ UNAUTHORIZED: {} });

export const appContract = {
  post: {
    byId: c.input(ById).output(Post).errors({ NOT_FOUND: {} }).query(),
    create: c.meta({ auth: true }).input(NewPost).output(Post).mutation(),
  },
};
```

## Implementing a contract

`t.implement(contract)` mirrors the contract. Each leaf already has its input, output, errors and route, and offers only `.use()`, `.provide()` and the terminal the contract declares. `impl.router()` checks at the type level and at runtime that every procedure is implemented and nothing else is added.

```ts
const impl = t
  .implement(appContract)
  .use(authed)
  .provide(Db, () => db);

export const appRouter = impl.router({
  post: {
    byId: impl.post.byId.query(
      (opts) => findPost(opts.input.id) ?? opts.errors.NOT_FOUND(),
    ),
    create: impl.post.create.mutation((opts) => createPost(opts.input)),
  },
});
```

- An implementation may only return errors its contract declares. Middleware passed to `impl.use()` or `impl.provide()` runs for every procedure, so all of them must declare its errors.
- The contract's meta keys must exist in `t`'s meta with types `t` accepts, because middleware reads them as `t`'s meta.
- Top-level contract keys named `router`, `use` or `provide` would shadow the implementer's methods, so `t.implement()` throws on them.

## Clients from a contract

A client takes the contract as its `router`, so the browser imports no server code and can [validate calls](../client/validation.md) against the contract's schemas:

```ts twoslash
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  validationLink,
} from '@trpc12/trpc/client';
import { contract } from '@trpc12/trpc/contract';
import { z } from 'zod';
import { PostSchema as Post } from './server.ts';
type Meta = { auth?: boolean };
const ById = z.object({ id: z.string() });
const NewPost = z.object({ title: z.string().min(1) });
declare const url: string;
const c = contract.create<{ meta: Meta }>().errors({ UNAUTHORIZED: {} });
const appContract = {
  post: {
    byId: c.input(ById).output(Post).errors({ NOT_FOUND: {} }).query(),
    create: c.meta({ auth: true }).input(NewPost).output(Post).mutation(),
  },
};
// ---cut-end---
const client = createTrpcClient({
  router: appContract,
  links: [validationLink({ contract: appContract }), httpLink({ url })],
});
```

## From a router or a document

`toContract(router)` derives the contract of an existing router, for the OpenAPI handler and build steps ([Lazy subtrees](./routers.md#lazy-subtrees)). To start from an OpenAPI document instead, see [A contract from OpenAPI](../openapi/from-document.md).

## Credits

[Zodios](https://www.zodios.org), by [ecyrbe](https://github.com/ecyrbe), pioneered schema-first APIs in TypeScript, with one definition of every endpoint for the client and the server, and [ts-rest](https://ts-rest.com), by [Oliver Butler](https://github.com/oliverbutler), made the contract a router that the server implements. v12's contracts and `t.implement()` follow [oRPC](https://orpc.dev)'s take on them.
