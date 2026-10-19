# NestJS example (experimental)

A Nest app serving a tRPC contract from a controller with `@trpc12/experimental-nest`. See [NestJS](../../../docs/integrations/nestjs.md).

- `src/contract.ts` is the contract, with REST routes in `.meta({ route })`. It has no decorators, so the client imports it without Nest.
- `src/posts.ts` has the `Posts` service, an `AdminGuard`, and `PostsController`. `@Implement(appContract.post)` adds a Nest route for each procedure under `post`, and the resolvers reach the injected service through `this`.
- `src/app.module.ts` registers `TrpcModule.forRoot()`. `createContext` reads the `x-user` header, and `layer` provides an Effect service (`RequestCounter`) to the `admin.stats` resolver.
- `server.ts` starts the app; `client.ts` calls it with `fetch` and with `experimental_openApiLink` built from the same contract, and checks the 401, the 404 and the guard's 403.

Everything from `@trpc12/experimental-nest`, `@trpc12/trpc/openapi` and `@trpc12/trpc/contract` is `experimental_*`. `t.implement()` and `createTrpcClient()` are stable.

The files follow the [examples layout](../../README.md), with two differences. Nest needs `experimentalDecorators`, which Node's type stripping can't run, so `pnpm build` compiles `src/app.module.ts` to `dist/` (`vite.config.ts`) and `server.ts` loads it from there. And the contract's REST routes are at the server's root, so `listen()`'s `url` is the root, not `/trpc`. Express only.

`pnpm build`, then `pnpm start` runs both; `pnpm server` and `pnpm client [url]` run them apart. `pnpm smoke` builds first.
