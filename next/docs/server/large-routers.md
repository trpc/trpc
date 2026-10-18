---
title: Large routers
description: Keep type-checking fast with thousands of procedures, by building the server's declarations and typing apps from them.
section: Server
order: 14
---

A client's types come from the router's type. If the client reads the server's source, TypeScript infers every procedure (input schemas, middleware, what each resolver returns) before it checks a single call. If it reads the server's built declarations (`.d.ts`), that work is already done and the client pays only for the procedures it calls.

Measured on a generated monorepo with 5000 zod procedures in 50 domain packages, a client app calling 200 of them:

| The app reads                   | Instantiations | Check |
| ------------------------------- | -------------: | ----: |
| the server's source             |      4,136,629 | 6.51s |
| the server's `.d.ts`            |         42,852 | 0.07s |
| two domains' source             |        253,470 | 0.29s |
| two domains' contracts (source) |        205,566 | 0.22s |

From declarations, the cost doesn't grow with the router. The [`examples/monorepo`](../../examples/monorepo) app is laid out this way.

## Build the server's declarations

Make each server package a TypeScript project that emits declarations, and have apps reference it:

```json
{
  "compilerOptions": {
    "composite": true,
    "emitDeclarationOnly": true,
    "declarationMap": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "references": [{ "path": "../trpc" }]
}
```

An app's `tsconfig.json` lists the api package in `references`, and imports its router type as usual (`import type { AppRouter } from '@acme/api'`). `tsc -b` builds the referenced packages first, then checks the app against their `dist/*.d.ts` instead of their source, even when the package exports its source files.

Split the server by domain (a package per area, each exporting its router and its type) so `tsc -b` rebuilds only the packages a change reaches. Keep `t` and base procedures such as `authed` in a package of their own that every domain depends on.

## Name the root router's type

Mount the domains in a router whose type you write from theirs:

```ts twoslash
// ---cut-start---
import { t } from './server.ts';
const postsRouter = { byId: t.procedure.query(() => 'post') };
const usersRouter = { me: t.procedure.query(() => 'me') };
type PostsRouter = typeof postsRouter;
type UsersRouter = typeof usersRouter;
// ---cut-end---
export type AppRouter = {
  posts: PostsRouter;
  users: UsersRouter;
};

export const appRouter: AppRouter = {
  posts: postsRouter,
  users: usersRouter,
};
```

The declarations then refer to each domain's type. Inferred from the object instead, they copy every domain's procedures into the api package's `.d.ts`, and past a few thousand procedures TypeScript stops with TS7056 ("the inferred type of this node exceeds the maximum length the compiler will serialize"). Write it as a `type`: an `interface` isn't accepted as a router.

## One client or several

With declarations, one client over the whole `AppRouter` is as cheap as a client of the domains an app uses: the client's types resolve a procedure only when a call reads it, so `Pick<AppRouter, 'posts'>` or a client per domain gains nothing.

Smaller clients help when the app can't read declarations (no build step before type-checking). A client of `{ posts: PostsRouter }` imported from the posts package loads only that domain, about 16× less than the whole router in the measurement.

## Contracts for apps that need one domain

An app that uses one domain can depend on a [contract](./contract-first.md) package instead of the server. It loads no server code (resolvers, database clients, their types), and its calls can be validated against the contract's schemas on the client. Build the contract package's declarations too; its cost is then its schemas'.

## In the editor

Editors follow project references to the referenced package's source, so the editor re-infers the server even when `tsc -b` doesn't. To have the editor read declarations too, set `disableSourceOfProjectReferenceRedirect: true` in the app's `tsconfig.json` and keep `tsc -b --watch` running: changes to the server show in the app once rebuilt. With `declarationMap: true` in the server packages, go-to-definition still lands in their source.

## Measuring

`tsc -p apps/web --extendedDiagnostics` prints the instantiation count and check time of one project; `--listFiles` shows whether it loaded a package's `src/` or its `dist/`. `tsc --generateTrace <dir>` records which types took the time.
