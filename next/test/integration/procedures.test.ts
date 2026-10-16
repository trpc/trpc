import { Context, Data, Effect, Layer } from 'effect';
import {
  createTrpcClient,
  httpLink,
  safe,
  type ClientError,
  routerType,
} from '@trpc12/trpc/client';
import {
  call,
  error,
  initTrpc,
  middleware,
  ok,
  tracked,
  TrpcError,
  type InputValidationErrorData,
  type TrackedEnvelope,
} from '@trpc12/trpc/server';
import { callProcedure } from '@trpc12/trpc/extend';
import { onError, onFinish, onStart, onSuccess } from '@trpc12/trpc/middleware';
import { createTestServer } from './fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import {
  openapi,
  type OpenApiMeta,
  type OperationSpec,
} from '@trpc12/trpc/openapi';

interface Ctx {
  user: string | null;
}
const t = initTrpc<{ ctx: Ctx }>().concat(openapi());

class CurrentUser extends Context.Service<CurrentUser, { name: string }>()(
  'CurrentUser',
) {}
class Clock extends Context.Service<Clock, { now: () => number }>()('Clock') {}

class DbError extends Data.TaggedError('DbError')<{ reason: string }> {}
const findPost = (
  id: string,
): Effect.Effect<{ id: string; title: string }, DbError> =>
  id === 'broken'
    ? Effect.fail(new DbError({ reason: 'connection lost' }))
    : Effect.succeed({ id, title: `Post ${id}` });

// --- declared errors --------------------------------------------------------------

const notFound = t.procedure.errors({
  NOT_FOUND: { data: z.object({ id: z.string() }) },
  GONE: { status: 410, message: 'This post was removed' },
});

const assertExists = (id: string, made: (id: string) => TrpcError) => {
  if (id.startsWith('missing')) throw made(id);
};

// --- middleware ---------------------------------------------------------------

const cache = new Map<string, unknown>([['cached.title', 'from cache']]);
const resolved: string[] = [];
const cached = t.procedure.use(({ path, next }) => {
  const hit = cache.get(path);
  return typeof hit === 'string' ? ok(hit) : next();
});

// Middleware nests: onFinish wraps the helpers after it, so it runs last.
const events: string[] = [];
const lifecycle = t.procedure
  .use(onStart(({ path }) => void events.push(`start ${path}`)))
  .use(onFinish((result) => void events.push(`finish ${result.ok}`)))
  .use(onError((err) => void events.push(`error ${err.code}`)))
  .use(onSuccess((data) => void events.push(`success ${String(data)}`)));

const withUser = t.middleware.effect<{ provides: CurrentUser }>()(
  ({ ctx, next }) =>
    ctx.user
      ? next().pipe(Effect.provideService(CurrentUser, { name: ctx.user }))
      : Effect.fail(error({ code: 'UNAUTHORIZED' })),
);

const timed = middleware.effect<{ ctx: { user: string | null } }>()(
  ({ next }) =>
    Effect.gen(function* () {
      const clock = yield* Clock;
      const start = clock.now();
      const result = yield* next({ ctx: { startedAt: start } });
      return result;
    }),
);

const router = {
  post: {
    byId: notFound
      .input(z.object({ id: z.string() }))
      .query(({ input, errors }) => {
        if (input.id === 'gone') return errors.GONE();
        assertExists(input.id, (id) => errors.NOT_FOUND({ data: { id } }));
        return { id: input.id };
      }),
    invalidData: notFound.query(({ errors }) =>
      errors.NOT_FOUND({ data: { id: 1 } as unknown as { id: string } }),
    ),
    fromEffect: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) =>
        findPost(input.id).pipe(
          Effect.catchTag('DbError', (e) =>
            Effect.fail(
              error({ code: 'SERVICE_UNAVAILABLE', message: e.reason }),
            ),
          ),
        ),
      ),
  },
  login: t.procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input, response }) => {
      response.headers.append('set-cookie', `session=${input.name}; HttpOnly`);
      response.status = 201;
      return { ok: true };
    }),
  theme: t.procedure.query(({ response }) => {
    response.headers.append('set-cookie', 'theme=dark');
    response.headers.set('x-theme', 'dark');
    return 'dark';
  }),
  cached: {
    title: cached.output(z.string()).query(() => {
      resolved.push('cached.title');
      return 'from resolver';
    }),
    other: cached.query(() => {
      resolved.push('cached.other');
      return 'from resolver';
    }),
  },
  lifecycle: {
    ok: lifecycle.query(() => 'yes'),
    fail: lifecycle.query(() => error({ code: 'CONFLICT' })),
  },
  me: t.procedure.use(withUser).query(() =>
    Effect.gen(function* () {
      return (yield* CurrentUser).name;
    }),
  ),
  timed: t.procedure.use(timed).query(({ ctx }) => ctx.startedAt),
  feed: t.procedure
    .output(z.object({ n: z.number().transform((n) => `#${n}`) }))
    .subscription(async function* () {
      yield tracked('1', { n: 1 });
      yield tracked('2', { n: 2 });
    }),
};
type AppRouter = typeof router;

const ClockLive = Layer.succeed(Clock, { now: () => 1234 });

async function setup(user: string | null = 'ada', batch = false) {
  const responses: Response[] = [];
  const server = await createTestServer({
    router,
    batch: true,
    createContext: () => ({ user }),
    layer: ClockLive,
    exposeUnexpectedErrors: false,
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({
        url: server.url,
        batch,
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          responses.push(response);
          return response;
        },
      }),
    ],
  });
  return {
    server,
    client,
    responses,
    [Symbol.asyncDispose]: () => server.close(),
  };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

test('input validation issues reach the client with unexpected errors masked (05 Q5.4)', async () => {
  await using ctx = await setup();
  const res = await safe(ctx.client.post.byId.query({ id: 1 as never }));
  expect(res.error).toMatchObject({
    code: 'BAD_REQUEST',
    defined: true,
    data: { issues: [{ path: ['id'] }] },
  });
  if (res.error?.defined && res.error.code === 'BAD_REQUEST') {
    expectTypeOf(res.error.data).toEqualTypeOf<InputValidationErrorData>();
  }
});

test('.errors() gives the resolver typed constructors for defined errors', async () => {
  await using ctx = await setup();
  const res = await safe(ctx.client.post.byId.query({ id: 'missing-1' }));
  expect(res.error).toMatchObject({
    code: 'NOT_FOUND',
    defined: true,
    data: { id: 'missing-1' },
  });
  if (res.error?.defined && res.error.code === 'NOT_FOUND') {
    expectTypeOf(res.error.data).toEqualTypeOf<{ id: string }>();
  }

  const gone = await safe(ctx.client.post.byId.query({ id: 'gone' }));
  expect(gone.error).toMatchObject({
    code: 'GONE',
    message: 'This post was removed',
    defined: true,
  });

  notFound.query(({ errors }) => {
    // @ts-expect-error -- NOT_FOUND declares data, so it is required
    errors.NOT_FOUND();
    // @ts-expect-error -- the data must match the declared schema
    errors.NOT_FOUND({ data: { id: 1 } });
    // @ts-expect-error -- only declared codes have constructors
    errors.CONFLICT();
    return null;
  });
});

test('declared error data is validated; invalid data is an unexpected error', async () => {
  await using ctx = await setup();
  const res = await safe(ctx.client.post.invalidData.query());
  expect(res.error).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
    defined: false,
  });
});

test('Effect failures must be mapped to a TrpcError (02 d.ii)', async () => {
  await using ctx = await setup();
  expect(await ctx.client.post.fromEffect.query({ id: '1' })).toEqual({
    id: '1',
    title: 'Post 1',
  });
  const res = await safe(ctx.client.post.fromEffect.query({ id: 'broken' }));
  expect(res.error).toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    message: 'connection lost',
    defined: true,
  });

  // @ts-expect-error -- DbError is not a TrpcError
  t.procedure.query(() => findPost('1'));
});

test('the response handle sets headers and the success status', async () => {
  await using ctx = await setup();
  expect(await ctx.client.login.mutate({ name: 'ada' })).toEqual({ ok: true });
  const response = ctx.responses.at(-1)!;
  expect(response.status).toBe(201);
  expect(response.headers.getSetCookie()).toEqual(['session=ada; HttpOnly']);
});

test('inside a batch, headers from every call are merged', async () => {
  await using ctx = await setup('ada', true);
  const [login, theme] = await Promise.all([
    ctx.client.login.mutate({ name: 'sam' }),
    ctx.client.theme.query(),
  ]);
  expect(login).toEqual({ ok: true });
  expect(theme).toBe('dark');
  expect(ctx.responses).toHaveLength(2);

  await Promise.all([
    ctx.client.theme.query(),
    ctx.client.post.byId.query({ id: '1' }),
  ]);
  const response = ctx.responses.at(-1)!;
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie()).toEqual(['theme=dark']);
  expect(response.headers.get('x-theme')).toBe('dark');
});

test('ok() short-circuits the chain; output validation still runs', async () => {
  await using ctx = await setup();
  resolved.length = 0;
  expect(await ctx.client.cached.title.query()).toBe('from cache');
  expect(await ctx.client.cached.other.query()).toBe('from resolver');
  expect(resolved).toEqual(['cached.other']);

  const numeric = t.procedure.use(({ next }) =>
    Math.random() > 2 ? ok(1) : next(),
  );
  // @ts-expect-error -- the middleware may short-circuit with a number
  numeric.output(z.string()).query(() => 'text');
  numeric.output(z.number()).query(() => 2);
});

test('lifecycle helpers observe the chain', async () => {
  await using ctx = await setup();
  events.length = 0;
  await ctx.client.lifecycle.ok.query();
  expect(events).toEqual(['start lifecycle.ok', 'success yes', 'finish true']);

  events.length = 0;
  const res = await safe(ctx.client.lifecycle.fail.query());
  expect(res.error).toMatchObject({ code: 'CONFLICT', defined: true });
  expect(events).toEqual([
    'start lifecycle.fail',
    'error CONFLICT',
    'finish false',
  ]);
});

test('Effect middleware provides services and its failures are typed', async () => {
  await using ctx = await setup();
  expect(await ctx.client.me.query()).toBe('ada');

  await using anon = await setup(null);
  const res = await safe(anon.client.me.query());
  expect(res.error).toMatchObject({ code: 'UNAUTHORIZED', defined: true });
  expectTypeOf(res.error).toEqualTypeOf<
    ClientError<TrpcError<'UNAUTHORIZED', undefined>> | undefined
  >();

  // Only the Clock layer is passed: the middleware provides CurrentUser.
  const provided = { me: router.me };
  await using server = await createTestServer({
    router: provided,
    createContext: () => ({ user: 'kim' }),
  });
  const client = createTrpcClient({
    router: routerType<typeof provided>(),
    links: [httpLink({ url: server.url })],
  });
  expect(await client.me.query()).toBe('kim');

  // @ts-expect-error -- declares CurrentUser but never provides it
  t.middleware.effect<{ provides: CurrentUser }>()(({ next }) => next());
});

test('a standalone Effect middleware adds ctx and requires its services', async () => {
  await using ctx = await setup();
  const startedAt = await ctx.client.timed.query();
  expect(startedAt).toBe(1234);
  expectTypeOf(startedAt).toEqualTypeOf<number>();

  const create = () =>
    // @ts-expect-error -- the timed middleware needs Clock from the layer
    createTestServer({
      router: { timed: router.timed },
      createContext: () => ({ user: null }),
    });
  expectTypeOf(create).toBeFunction();
});

test('.output() types tracked() subscription events', async () => {
  await using ctx = await setup();
  const items = await collect(ctx.client.feed.subscribe());
  expectTypeOf(items).toEqualTypeOf<TrackedEnvelope<{ n: string }>[]>();
  expect(items).toEqual([
    { id: '1', data: { n: '#1' } },
    { id: '2', data: { n: '#2' } },
  ]);

  const wrongEvents = async function* () {
    yield tracked('1', { n: 'one' });
  };
  const numbers = t.procedure.output(z.object({ n: z.number() }));
  // @ts-expect-error -- events must match the output schema's input
  numbers.subscription(wrongEvents);
});

test('route meta from openapi() merges by key, and spec functions compose', () => {
  const security = (op: OperationSpec) => ({
    ...op,
    security: [{ bearer: [] }],
  });
  const base = t.procedure.meta({ route: { tags: ['posts'], spec: security } });
  const proc = base
    .meta({
      route: {
        method: 'GET',
        path: '/posts/{id}',
        spec: (op) => ({ ...op, summary: 'One post' }),
      },
    })
    .query(() => null);
  const { spec, ...route } = (proc['~trpc'].meta as OpenApiMeta).route!;
  expect(route).toEqual({
    method: 'GET',
    path: '/posts/{id}',
    tags: ['posts'],
  });
  expect(typeof spec === 'function' && spec({})).toEqual({
    security: [{ bearer: [] }],
    summary: 'One post',
  });
  // @ts-expect-error -- without openapi(), there is no route meta
  initTrpc().procedure.meta({ route: { path: '/x' } });
});

test('call() runs one procedure, with a layer for its services', async () => {
  expect(
    await call(router.timed, undefined, {
      ctx: { user: null },
      layer: ClockLive,
    }),
  ).toBe(1234);
  await expect(
    call(router.post.byId, { id: 'missing-2' }, { ctx: { user: null } }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND', defined: true });

  // @ts-expect-error -- `timed` needs Clock, so `layer` is required
  const missing = () => call(router.timed, undefined, { ctx: { user: null } });
  expectTypeOf(missing).toBeFunction();
});

test('.output(schema, { validate: false }) types the result without running the schema (04 Q4.4)', async () => {
  const Post = z.object({
    id: z.string(),
    at: z.string().transform((s) => new Date(s)),
  });
  const typed = t.procedure
    .output(Post, { validate: false })
    .query(() => ({ id: '1', at: '2026-10-15', extra: true }) as never);
  const result = await call(typed, undefined, { ctx: { user: null } });
  expect(result).toEqual({ id: '1', at: '2026-10-15', extra: true });
  expectTypeOf(result).toEqualTypeOf<{ id: string; at: string }>();

  // @ts-expect-error -- still typed by the schema's input
  t.procedure.output(Post, { validate: false }).query(() => ({ id: 1 }));

  const validated = t.procedure
    .output(Post)
    .query(() => ({ id: '1', at: '2026-10-15' }));
  const out = await call(validated, undefined, { ctx: { user: null } });
  expect(out.at).toBeInstanceOf(Date);
});

test('procedures without async steps run synchronously', () => {
  const plusOne = initTrpc()
    .procedure.input(z.object({ n: z.number() }))
    .output(z.number())
    .query(({ input }) => Effect.succeed(input.n + 1));
  const run = callProcedure({
    procedure: plusOne,
    path: 'plusOne',
    ctx: {},
    input: { n: 1 },
    signal: new AbortController().signal,
  });
  expect(Effect.runSync(run as Effect.Effect<unknown, unknown>)).toBe(2);
});

test('next({ input }) replaces the input for later steps, typed like ctx (#6892)', async () => {
  const slugs = new Map([['hello-world', { id: '1', title: 'Hello' }]]);
  const bySlug = t.procedure
    .input(z.object({ slug: z.string() }))
    .use(({ input, ctx, next }) => {
      const post = slugs.get(input.slug);
      return post
        ? next({ input: { post }, ctx: { viewer: ctx.user ?? 'anon' } })
        : error({ code: 'NOT_FOUND' });
    })
    .query(({ input, ctx }) => {
      expectTypeOf(input).toEqualTypeOf<{
        post: { id: string; title: string };
      }>();
      return `${input.post.title} for ${ctx.viewer}`;
    });
  expect(
    await call(bySlug, { slug: 'hello-world' }, { ctx: { user: 'ada' } }),
  ).toBe('Hello for ada');
  void (() =>
    // @ts-expect-error -- the client still sends the schema's input
    call(bySlug, { post: { id: '1', title: 'x' } }, { ctx: { user: null } }));

  const trimmed = t.procedure
    .input(z.string())
    .use(({ input, next }) => next({ input: input.trim().length }))
    .query(({ input }) => {
      expectTypeOf(input).toEqualTypeOf<number>();
      return input;
    });
  expect(await call(trimmed, '  hi  ', { ctx: { user: null } })).toBe(2);

  const doubled = t.procedure
    .input(z.number())
    .use(
      t.middleware.effect()(({ input, next }) =>
        next({ input: String((input as number) * 2) }),
      ),
    )
    .query(({ input }) => {
      expectTypeOf(input).toEqualTypeOf<string>();
      return input;
    });
  expect(await call(doubled, 4, { ctx: { user: null } })).toBe('8');
});
