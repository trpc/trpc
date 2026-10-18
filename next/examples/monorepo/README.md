# Monorepo example

A tRPC API split into domain packages, with apps that type-check against the server's built declarations instead of its source. The layout scales to thousands of procedures: see [Large routers](../../docs/server/large-routers.md).

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
```

- Every package is a TypeScript project (`composite`, `emitDeclarationOnly`) that references the packages it imports. `tsc -b` builds them in order, and a package that imports another reads that package's `dist/*.d.ts`, not its source. So `apps/web` loads five `.d.ts` files and never infers a procedure.
- `packages/api` names `AppRouter` as `{ posts: PostsRouter; … }`. Inferred from the object instead, its declarations would copy every domain's procedures.
- `apps/billing-widget` depends on `billing-contract` only. It can't import server code by accident, and it validates calls against the contract's schemas with `validationLink`.
- Packages export their `src/*.ts` (Node runs TypeScript directly), so nothing needs bundling to run. Editors follow project references to source; set `disableSourceOfProjectReferenceRedirect` in an app's `tsconfig.json` to have the editor read declarations too, with `tsc -b --watch` running.

Run it from `next/` with `pnpm example`, or here with `pnpm smoke` (`tsc -b`, then `smoke.ts` starts the server and runs both apps).
