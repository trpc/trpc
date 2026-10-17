---
title: NestJS
description: Serve a contract from Nest controllers with @trpc12/nest.
section: Integrations
order: 8
---

`@trpc12/nest` serves a contract from Nest controllers. `@experimental_Implement(contract)` adds the Nest route for the contract's REST mapping; the method returns the procedure, so the controller's injected services reach the resolver through `this`. The package is experimental, so its values are named `experimental_*` until it's promoted.

```ts
import { experimental_Implement, experimental_TrpcModule } from '@trpc12/nest';

const impl = t.implement(appContract);

@Controller()
class PostController {
  constructor(@Inject(Posts) private readonly posts: Posts) {}

  @experimental_Implement(appContract.post.byId) // .meta({ route: { method: 'GET', path: '/posts/{id}' } })
  byId() {
    return impl.post.byId.query(
      ({ input, errors }) =>
        this.posts.find(input.id) ??
        errors.NOT_FOUND({ data: { id: input.id } }),
    );
  }
}

@Module({
  imports: [
    experimental_TrpcModule.forRoot({
      createContext: ({ platform }) => ({
        user: platform.switchToHttp().getRequest().user,
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
