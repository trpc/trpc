---
title: NestJS
description: Serve a contract from Nest controllers with @trpc12/nest.
section: Integrations
order: 5
hidden: true
---

`@trpc12/nest` serves a contract from Nest controllers. `@experimental_Implement(contract)` adds the Nest route for the contract's REST mapping; the method returns the procedure, so the controller's injected services reach the resolver through `this`. The package is experimental, so its values are named `experimental_*` until it's promoted.

```package-install
@trpc12/trpc effect @trpc12/nest @nestjs/common @nestjs/core @effect/platform-node rxjs
```

```ts twoslash
// @experimentalDecorators: true
// ---cut-start---
import { Controller, Inject, Injectable, Module } from '@nestjs/common';
import { contract } from '@trpc12/trpc/contract';
import { experimental_openapi } from '@trpc12/trpc/openapi';
import { initTrpc } from '@trpc12/trpc/server';
import { Context, Layer } from 'effect';
import { z } from 'zod';
import { db, PostSchema, type User } from './server.ts';
const c = contract.create().concat(experimental_openapi());
const appContract = {
  post: {
    byId: c
      .meta({ route: { method: 'GET', path: '/posts/{id}' } })
      .input(z.object({ id: z.string() }))
      .output(PostSchema)
      .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
      .query(),
  },
};
const t = initTrpc<{ ctx: { user: User | null } }>().concat(
  experimental_openapi(),
);
@Injectable()
class Posts {
  find(id: string) {
    return db.post.find(id);
  }
}
class Db extends Context.Service<Db, typeof db>()('Db') {
  static readonly layer = Layer.succeed(Db, db);
}
// ---cut-end---
import { experimental_Implement, experimental_TrpcModule } from '@trpc12/nest';

const impl = t.implement(appContract);

@Controller()
class PostController {
  constructor(@Inject(Posts) private readonly posts: Posts) {}

  @experimental_Implement(appContract.post.byId) // .meta({ route: { method: 'GET', path: '/posts/{id}' } })
  byId() {
    return impl.post.byId.query(
      (opts) =>
        this.posts.find(opts.input.id) ??
        opts.errors.NOT_FOUND({ data: { id: opts.input.id } }),
    );
  }
}

@Module({
  imports: [
    experimental_TrpcModule.forRoot({
      createContext: (opts) => ({
        user: opts.platform.switchToHttp().getRequest().user,
      }),
      layer: Db.layer,
    }),
  ],
  controllers: [PostController],
  providers: [Posts],
})
class AppModule {}
```

- A leaf needs a route `path`, `.meta({ route: { path } })`. Pass a contract router instead and return `impl.router({ … })` (or a plain object of procedures) to get default paths from the keys below it (`/post/byId`).
- `experimental_TrpcModule.forRoot()` takes the OpenAPI handler's options; `createContext`'s `platform` is Nest's `ExecutionContext`. `forRootAsync({ inject, useFactory })` builds them from providers. One handler serves every route, so the `layer` is built once and released on shutdown (`app.enableShutdownHooks()` or `app.close()`).
- Guards, pipes and filters run as usual; put `@experimental_Implement` above the method's other decorators so they apply to every route it adds. The procedure's own middleware and validation run after them, and errors use the REST shape above.
- Bodies Nest's JSON and urlencoded parsers read are used as parsed; others are read from the request.
- Express only. Nest needs `experimentalDecorators`.

Routes and errors follow the [OpenAPI handler](../openapi/routes.md).

## Credits

`@trpc12/nest` follows [oRPC's NestJS integration](https://orpc.dev/docs/integrations/nest).
