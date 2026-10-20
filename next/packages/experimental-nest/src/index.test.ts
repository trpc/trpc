import 'reflect-metadata';
import {
  Controller,
  Get,
  Headers,
  Inject,
  Injectable,
  Module,
  UseGuards,
  UseInterceptors,
  type CanActivate,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Context, Effect, Layer, ManagedRuntime, Schema } from 'effect';
import { createTrpcClient, safe } from '@trpc12/trpc/client';
import {
  type AnyContractRouter,
  experimental_contract,
  experimental_toContract,
} from '@trpc12/trpc/contract';
import {
  experimental_openapi,
  experimental_openApiLink,
} from '@trpc12/trpc/openapi';
import { initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { Implement, ImplementInterceptor, TrpcModule } from './index.ts';

const c = experimental_contract.create().concat(experimental_openapi());
const Post = Schema.Struct({ id: Schema.String, title: Schema.String });

const appContract = {
  health: c.output(Schema.Literal('ok')).query(),
  post: {
    byId: c
      .meta({ route: { method: 'GET', path: '/posts/{id}' } })
      .input(Schema.Struct({ id: Schema.String }))
      .output(Post)
      .errors({ NOT_FOUND: { data: Schema.Struct({ id: Schema.String }) } })
      .query(),
    create: c
      .meta({ route: { method: 'POST', path: '/posts', successStatus: 201 } })
      .input(Schema.Struct({ title: Schema.String }))
      .output(Post)
      .errors({ UNAUTHORIZED: {} })
      .mutation(),
    count: c.output(Schema.Number).query(),
  },
  secret: c
    .meta({ route: { path: '/secret' } })
    .output(Schema.String)
    .query(),
  ticks: c
    .meta({ route: { path: '/ticks' } })
    .output(Schema.Number)
    .subscription(),
  file: c
    .meta({ route: { path: '/files/{rest}' } })
    .input(Schema.Struct({ rest: Schema.String }))
    .output(Schema.String)
    .query(),
  whoami: c.output(Schema.String).query(),
  broken: { one: c.output(Schema.String).query() },
} satisfies AnyContractRouter;

class Counter extends Context.Service<
  Counter,
  { next: Effect.Effect<number> }
>()('Counter') {}

const t = initTrpc<{ ctx: { user: string | null } }>().concat(
  experimental_openapi(),
);
const impl = t.implement(appContract);

@Injectable()
class Posts {
  readonly #posts = new Map([['1', { id: '1', title: 'Hello' }]]);
  find(id: string) {
    return this.#posts.get(id);
  }
  add(title: string) {
    const post: typeof Post.Type = { id: String(this.#posts.size + 1), title };
    this.#posts.set(post.id, post);
    return post;
  }
}

@Controller()
class PostController {
  readonly #posts: Posts;
  constructor(@Inject(Posts) posts: Posts) {
    this.#posts = posts;
  }

  @Implement(appContract.post.byId)
  byId() {
    return impl.post.byId.query(
      (opts) =>
        this.#posts.find(opts.input.id) ??
        opts.errors.NOT_FOUND({ data: { id: opts.input.id } }),
    );
  }
}

@Controller()
class RestController {
  readonly #posts: Posts;
  constructor(@Inject(Posts) posts: Posts) {
    this.#posts = posts;
  }

  @Implement({
    health: appContract.health,
    post: { create: appContract.post.create, count: appContract.post.count },
  })
  rest() {
    return {
      health: impl.health.query(() => 'ok' as const),
      post: {
        create: impl.post.create.mutation((opts) =>
          opts.ctx.user
            ? this.#posts.add(opts.input.title)
            : opts.errors.UNAUTHORIZED(),
        ),
        count: impl.post.count.query(() =>
          Effect.gen(function* () {
            const counter = yield* Counter;
            return yield* counter.next;
          }),
        ),
      },
    };
  }
}

class Deny implements CanActivate {
  canActivate(): boolean {
    return false;
  }
}

@Controller()
class GuardedController {
  @Implement(appContract.secret)
  @UseGuards(Deny)
  secret() {
    return impl.secret.query(() => 'hidden');
  }

  @Implement(appContract.ticks)
  ticks() {
    return impl.ticks.subscription(async function* () {
      yield 1;
      await new Promise((r) => setTimeout(r, 10));
      yield 2;
    });
  }
}

@Controller()
class EdgeController {
  // Above @Implement, so Nest routes it by this wildcard path.
  @Get('/files/*rest')
  @Implement(appContract.file)
  file() {
    return impl.file.query((opts) => opts.input.rest);
  }

  @Implement({ whoami: appContract.whoami })
  @UseGuards(Deny)
  denied() {
    return { whoami: impl.whoami.query(() => 'never') };
  }

  @Implement({ broken: appContract.broken })
  notAProcedure() {
    return {};
  }

  @Get('/plain')
  @UseInterceptors(ImplementInterceptor)
  plain() {
    return 'not a procedure route';
  }
}

@Controller('headers')
class HeaderController {
  @Implement({ whoami: appContract.whoami })
  whoami(@Headers('x-user') user: string | undefined) {
    return { whoami: impl.whoami.query(() => user ?? 'anon') };
  }
}

let count = 0;

@Module({
  imports: [
    TrpcModule.forRoot({
      createContext: (opts) => {
        const req = opts.platform.switchToHttp().getRequest<{ path: string }>();
        expect(req.path).toBeTypeOf('string');
        return { user: opts.request.headers['x-user'] ?? null };
      },
      layer: Layer.succeed(Counter, { next: Effect.sync(() => ++count) }),
    }),
  ],
  controllers: [
    PostController,
    RestController,
    GuardedController,
    EdgeController,
    HeaderController,
  ],
  providers: [Posts],
})
class AppModule {}

const listen = async () => {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  return { url: await app.getUrl(), [Symbol.asyncDispose]: () => app.close() };
};

test('a leaf is served at its route with the controller’s services', async () => {
  await using app = await listen();
  const res = await fetch(`${app.url}/posts/1`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: '1', title: 'Hello' });

  const missing = await fetch(`${app.url}/posts/9`);
  expect(missing.status).toBe(404);
  expect(await missing.json()).toMatchObject({
    code: 'NOT_FOUND',
    data: { id: '9' },
    defined: true,
  });
});

test('a router gets default paths from its keys; bodies Nest parsed are read', async () => {
  await using app = await listen();
  expect(await (await fetch(`${app.url}/health`)).json()).toBe('ok');

  const create = (headers: Record<string, string>, body: string) =>
    fetch(`${app.url}/posts`, { method: 'POST', headers, body });
  const json: Record<string, string> = { 'content-type': 'application/json' };
  expect((await create(json, '{"title":"x"}')).status).toBe(401);

  const created = await create({ ...json, 'x-user': 'ada' }, '{"title":"Hi"}');
  expect(created.status).toBe(201);
  expect(await created.json()).toEqual({ id: '2', title: 'Hi' });

  const form = await create(
    { 'content-type': 'application/x-www-form-urlencoded', 'x-user': 'ada' },
    'title=Form',
  );
  expect(form.status).toBe(201);
  expect(await form.json()).toEqual({ id: '3', title: 'Form' });
});

test('the module layer provides Effect services', async () => {
  await using app = await listen();
  expect(await (await fetch(`${app.url}/post/count`)).json()).toBe(1);
  expect(await (await fetch(`${app.url}/post/count`)).json()).toBe(2);
});

test('closing the app releases the module layer', async () => {
  let released = 0;
  @Controller()
  class CountController {
    @Implement({ count: appContract.post.count })
    count() {
      return { count: impl.post.count.query(() => Counter.use((c) => c.next)) };
    }
  }
  @Module({
    imports: [
      TrpcModule.forRoot({
        layer: Layer.effect(
          Counter,
          Effect.acquireRelease(
            Effect.succeed({ next: Effect.succeed(1) }),
            () => Effect.sync(() => released++),
          ),
        ),
      }),
    ],
    controllers: [CountController],
  })
  class ReleaseModule {}
  const nest = await NestFactory.create(ReleaseModule, { logger: false });
  await nest.listen(0, '127.0.0.1');
  expect(await (await fetch(`${await nest.getUrl()}/count`)).json()).toBe(1);
  expect(released).toBe(0);
  await nest.close();
  expect(released).toBe(1);
});

test('a caller-owned runtime provides the services, and closing the app leaves it to its owner', async () => {
  let released = 0;
  await using runtime = ManagedRuntime.make(
    Layer.effect(
      Counter,
      Effect.acquireRelease(Effect.succeed({ next: Effect.succeed(2) }), () =>
        Effect.sync(() => released++),
      ),
    ),
  );
  @Controller()
  class CountController {
    @Implement({ count: appContract.post.count })
    count() {
      return { count: impl.post.count.query(() => Counter.use((c) => c.next)) };
    }
  }
  @Module({
    imports: [TrpcModule.forRoot({ runtime })],
    controllers: [CountController],
  })
  class RuntimeModule {}
  const nest = await NestFactory.create(RuntimeModule, { logger: false });
  await nest.listen(0, '127.0.0.1');
  expect(await (await fetch(`${await nest.getUrl()}/count`)).json()).toBe(2);
  await nest.close();
  expect(released).toBe(0);
  await runtime.dispose();
  expect(released).toBe(1);
});

test('TrpcModule takes a layer or a runtime, not both', async () => {
  const layer = Layer.succeed(Counter, { next: Effect.succeed(1) });
  const runtime = ManagedRuntime.make(layer);
  @Module({
    // @ts-expect-error -- `layer` and `runtime` are exclusive
    imports: [TrpcModule.forRoot({ runtime, layer })],
  })
  class BothModule {}
  // @ts-expect-error -- and so in a factory's options
  TrpcModule.forRootAsync({ useFactory: () => ({ runtime, layer }) });
  await expect(
    NestFactory.create(BothModule, { logger: false, abortOnError: false }),
  ).rejects.toThrow('pass `layer` or `runtime`, not both');
  await runtime.dispose();
});

test('Nest guards run before the procedure', async () => {
  await using app = await listen();
  const res = await fetch(`${app.url}/secret`);
  expect(res.status).toBe(403);
});

test('subscriptions stream as server-sent events', async () => {
  await using app = await listen();
  const res = await fetch(`${app.url}/ticks`);
  expect(res.headers.get('content-type')).toBe('text/event-stream');
  const body = await res.text();
  expect(body).toContain('event: message\ndata: 1\n\n');
  expect(body).toContain('event: message\ndata: 2\n\n');
  expect(body).toContain('event: done');
});

test('experimental_openApiLink calls the Nest app with the contract', async () => {
  await using app = await listen();
  const client = createTrpcClient({
    router: appContract,
    links: [
      experimental_openApiLink({
        url: app.url,
        prefix: '',
        contract: experimental_toContract(appContract),
      }),
    ],
  });
  expect(await client.post.byId.query({ id: '1' })).toEqual({
    id: '1',
    title: 'Hello',
  });
  const [, err] = await safe(client.post.byId.query({ id: 'nope' }));
  expect(err).toMatchObject({ code: 'NOT_FOUND', data: { id: 'nope' } });
});

test('a leaf without a route path throws', () => {
  expect(() => {
    class Bad {
      @Implement(appContract.health)
      health() {
        return impl.health.query(() => 'ok' as const);
      }
    }
    return Bad;
  }).toThrow(/needs a route path/);
});

test('wildcard params are joined; methods that return no procedure fail; other routes pass through', async () => {
  await using app = await listen();
  const file = await fetch(`${app.url}/files/a/b/c`);
  expect(await file.json()).toBe('a/b/c');

  expect((await fetch(`${app.url}/broken/one`)).status).toBe(500);
  expect(await (await fetch(`${app.url}/plain`)).text()).toBe(
    'not a procedure route',
  );
});

test('a router method keeps its guards and parameter decorators on every route', async () => {
  await using app = await listen();
  expect((await fetch(`${app.url}/whoami`)).status).toBe(403);
  const res = await fetch(`${app.url}/headers/whoami`, {
    headers: { 'x-user': 'ada' },
  });
  expect(await res.json()).toBe('ada');
});

test('forRootAsync builds the options from injected providers', async () => {
  const Prefix = Symbol('Prefix');
  @Module({
    providers: [{ provide: Prefix, useValue: 'from-config' }],
    exports: [Prefix],
  })
  class ConfigModule {}

  @Controller()
  class WhoController {
    @Implement({ whoami: appContract.whoami })
    who() {
      return {
        whoami: impl.whoami.query((opts) => opts.ctx.user ?? 'anon'),
      };
    }
  }

  const serve = async (module: object) => {
    const nest = await NestFactory.create(module as never, { logger: false });
    await nest.listen(0, '127.0.0.1');
    try {
      return await (await fetch(`${await nest.getUrl()}/whoami`)).json();
    } finally {
      await nest.close();
    }
  };

  @Module({
    imports: [
      TrpcModule.forRootAsync({
        imports: [ConfigModule],
        inject: [Prefix],
        useFactory: (prefix: string) => ({
          createContext: () => ({ user: prefix }),
        }),
      }),
    ],
    controllers: [WhoController],
  })
  class InjectedModule {}
  expect(await serve(InjectedModule)).toBe('from-config');

  @Module({
    imports: [
      TrpcModule.forRootAsync({
        useFactory: async () => ({ createContext: () => ({ user: null }) }),
      }),
    ],
    controllers: [WhoController],
  })
  class PlainModule {}
  expect(await serve(PlainModule)).toBe('anon');
});
