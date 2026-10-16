import 'reflect-metadata';
import {
  Controller,
  Inject,
  Injectable,
  Module,
  UseGuards,
  type CanActivate,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Context, Effect, Layer, Schema } from 'effect';
import { createTrpcClient, safe } from 'trpcdev/client';
import { contract, toContract } from 'trpcdev/contract';
import { openApiLink } from 'trpcdev/openapi';
import { initTrpc } from 'trpcdev/server';
import { afterAll, beforeAll, expect, test } from 'vite-plus/test';
import { Implement, TrpcModule } from './index.ts';

const c = contract.create();
const Post = Schema.Struct({ id: Schema.String, title: Schema.String });

const appContract = {
  health: c.output(Schema.Literal('ok')).query(),
  post: {
    byId: c
      .route({ method: 'GET', path: '/posts/{id}' })
      .input(Schema.Struct({ id: Schema.String }))
      .output(Post)
      .errors({ NOT_FOUND: { data: Schema.Struct({ id: Schema.String }) } })
      .query(),
    create: c
      .route({ method: 'POST', path: '/posts', successStatus: 201 })
      .input(Schema.Struct({ title: Schema.String }))
      .output(Post)
      .errors({ UNAUTHORIZED: {} })
      .mutation(),
    count: c.output(Schema.Number).query(),
  },
  secret: c.route({ path: '/secret' }).output(Schema.String).query(),
  ticks: c.route({ path: '/ticks' }).output(Schema.Number).subscription(),
};

class Counter extends Context.Service<
  Counter,
  { next: Effect.Effect<number> }
>()('Counter') {}

const t = initTrpc<{ ctx: { user: string | null } }>();
const impl = t.implement(appContract);

@Injectable()
class Posts {
  readonly #posts = new Map([['1', { id: '1', title: 'Hello' }]]);
  find(id: string) {
    return this.#posts.get(id);
  }
  add(title: string) {
    const post = { id: String(this.#posts.size + 1), title };
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
      ({ input, errors }) =>
        this.#posts.find(input.id) ??
        errors.NOT_FOUND({ data: { id: input.id } }),
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
        create: impl.post.create.mutation(({ input, ctx, errors }) =>
          ctx.user ? this.#posts.add(input.title) : errors.UNAUTHORIZED(),
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

let count = 0;

@Module({
  imports: [
    TrpcModule.forRoot({
      createContext: ({ request, platform }) => {
        const req = platform.switchToHttp().getRequest<{ path: string }>();
        expect(req.path).toBeTypeOf('string');
        return { user: request.headers['x-user'] ?? null };
      },
      layer: Layer.succeed(Counter, { next: Effect.sync(() => ++count) }),
    }),
  ],
  controllers: [PostController, RestController, GuardedController],
  providers: [Posts],
})
class AppModule {}

let app: INestApplication;
let url: string;

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
});
afterAll(() => app.close());

test('a leaf is served at its route with the controller’s services', async () => {
  const res = await fetch(`${url}/posts/1`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: '1', title: 'Hello' });

  const missing = await fetch(`${url}/posts/9`);
  expect(missing.status).toBe(404);
  expect(await missing.json()).toMatchObject({
    code: 'NOT_FOUND',
    data: { id: '9' },
    defined: true,
  });
});

test('a router gets default paths from its keys; bodies Nest parsed are read', async () => {
  expect(await (await fetch(`${url}/health`)).json()).toBe('ok');

  const create = (headers: Record<string, string>, body: string) =>
    fetch(`${url}/posts`, { method: 'POST', headers, body });
  const json = { 'content-type': 'application/json' };
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
  expect(await (await fetch(`${url}/post/count`)).json()).toBe(1);
  expect(await (await fetch(`${url}/post/count`)).json()).toBe(2);
});

test('Nest guards run before the procedure', async () => {
  const res = await fetch(`${url}/secret`);
  expect(res.status).toBe(403);
});

test('subscriptions stream as server-sent events', async () => {
  const res = await fetch(`${url}/ticks`);
  expect(res.headers.get('content-type')).toBe('text/event-stream');
  const body = await res.text();
  expect(body).toContain('event: message\ndata: 1\n\n');
  expect(body).toContain('event: message\ndata: 2\n\n');
  expect(body).toContain('event: done');
});

test('openApiLink calls the Nest app with the contract', async () => {
  const client = createTrpcClient({
    router: appContract,
    links: [
      openApiLink({ url, prefix: '', contract: toContract(appContract) }),
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
  }).toThrow(/needs a \.route\(\{ path \}\)/);
});
