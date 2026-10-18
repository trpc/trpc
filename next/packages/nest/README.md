# `@trpc12/nest`

Serves contract-first procedures from NestJS controllers: `@experimental_Implement(contract)` routes a controller method by the contract's REST mapping, and the procedure it returns runs on `@trpc12/trpc/openapi`'s handler, so the controller's injected services reach the resolver through `this`.

```sh
pnpm add @trpc12/trpc @trpc12/nest @nestjs/common @nestjs/core @effect/platform-node effect rxjs
```

```ts
@Controller()
class PostController {
  constructor(@Inject(Posts) private readonly posts: Posts) {}

  @experimental_Implement(appContract.post.byId)
  byId() {
    return impl.post.byId.query((opts) => this.posts.find(opts.input.id));
  }
}

@Module({
  imports: [experimental_TrpcModule.forRoot({ createContext })],
  controllers: [PostController],
})
class AppModule {}
```

## Docs

- [NestJS](https://github.com/trpc/trpc/blob/v12/next/docs/integrations/nestjs.md)
- [Contract-first](https://github.com/trpc/trpc/blob/v12/next/docs/server/contract-first.md)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://github.com/trpc/trpc/blob/v12/next/docs/packages.md#stability)).
