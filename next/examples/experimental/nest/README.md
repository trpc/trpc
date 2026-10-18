# NestJS example (experimental)

A Nest app serving a tRPC contract from a controller with `@trpc12/nest`. See [NestJS](../../../docs/integrations/nestjs.md).

- `src/contract.ts` is the contract, with REST routes in `.meta({ route })`. It has no decorators, so clients import it without Nest.
- `src/posts.ts` has the `Posts` service, an `AdminGuard`, and `PostsController`. `@experimental_Implement(appContract.post)` adds a Nest route for each procedure under `post`, and the resolvers reach the injected service through `this`.
- `src/app.module.ts` registers `experimental_TrpcModule.forRoot()`. `createContext` reads the `x-user` header, and `layer` provides an Effect service (`RequestCounter`) to the `admin.stats` resolver.
- `smoke.ts` starts the built server. It calls it with `fetch` and with `experimental_openApiLink` built from the same contract, and checks the 401, 404 and guard 403.

Everything from `@trpc12/nest` and `@trpc12/trpc/openapi` is `experimental_*`. `contract`, `t.implement()` and `createTrpcClient()` are stable.

Nest needs `experimentalDecorators`, which Node's type stripping can't run, so `vp build` bundles `src/main.ts` to `dist/main.js` first (`vite.config.ts`). Express only.

Run it from `next/` with `pnpm example`, or here with `pnpm smoke`. `pnpm build && pnpm start` serves it on port 3000.
