# `@trpc12/experimental-nest`

Serves contract-first procedures from NestJS controllers: `@Implement(contract)` routes a controller method by the contract's REST mapping, and the procedure it returns runs on `@trpc12/trpc/openapi`'s handler, so the controller's injected services reach the resolver through `this`.

The whole package is experimental, as its name says: every export might change or go away in any release.

```sh
pnpm add @trpc12/trpc effect @trpc12/experimental-nest @nestjs/common @nestjs/core @effect/platform-node rxjs
```

```ts
@Controller()
class PostController {
  constructor(@Inject(Posts) private readonly posts: Posts) {}

  @Implement(appContract.post.byId)
  byId() {
    return impl.post.byId.query((opts) => this.posts.find(opts.input.id));
  }
}

@Module({
  imports: [TrpcModule.forRoot({ createContext })],
  controllers: [PostController],
})
class AppModule {}
```

## Docs

- [NestJS](https://v12.trpc.io/v12/docs/integrations/nestjs)
- [Contract-first](https://v12.trpc.io/v12/docs/server/contract-first)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://v12.trpc.io/v12/docs/packages#stability)).
