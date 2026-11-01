# Monorepo example

A tRPC API split into domain packages, with apps that type-check against the server's built declarations instead of its source. The layout scales to thousands of procedures: see [Large routers](https://v12.trpc.io/v12/docs/server/large-routers).

```
packages/
  trpc/              t, Context and the base procedures every domain builds on
  posts/  users/     domain routers; each exports its router and its type
  billing-contract/  a domain as a contract: schemas only, no server code
  billing/           implements billing-contract with t.implement()
  api/               mounts the domains; AppRouter is named from their types
  server/            the fetch handler
apps/
  web/               routerType<AppRouter>() over the whole API
  billing-widget/    a client typed from billing-contract alone
server.ts            listen(): serves packages/server's handler
client.ts            main(url): runs both apps against it
start.ts             runs client.ts against server.ts
```

- Every package is a TypeScript project (`composite`, `emitDeclarationOnly`) that references the packages it imports. `tsc -b` builds them in order, and a package that imports another reads that package's `dist/*.d.ts`, not its source. So `apps/web` loads five `.d.ts` files and never infers a procedure.
- `packages/api` names `AppRouter` as `{ posts: PostsRouter; … } & RouterCtx<Context>`, the type `t.router()` gives the root. Inferred from the object instead, its declarations would copy every domain's procedures.
- `apps/billing-widget` depends on `billing-contract` only. It can't import server code by accident, and it validates calls against the contract's schemas with `experimental_validationLink`.
- Packages export their `src/*.ts` (Node runs TypeScript directly), so nothing needs bundling to run. Editors follow project references to source; set `disableSourceOfProjectReferenceRedirect` in an app's `tsconfig.json` to have the editor read declarations too, with `tsc -b --watch` running.

`pnpm start` runs it, from source (Node runs the packages' TypeScript directly). `pnpm server` and `pnpm client` run the halves apart. `pnpm typecheck` is `tsc -b`, and `pnpm smoke` (what `pnpm example` from `next/` runs) is `tsc -b`, then `pnpm start`.
