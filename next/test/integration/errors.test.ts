import { Effect } from 'effect';
import {
  createSafeClient,
  createTrpcClient,
  httpLink,
  isDefinedError,
  safe,
  TrpcError,
  routerType,
} from '@trpc12/trpc/client';
import { error, initTrpc, type OnErrorOpts } from '@trpc12/trpc/server';
import { createTestServer } from './fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();

const posts = new Map([['1', { id: '1', title: 'Hello', published: true }]]);
posts.set('2', { id: '2', title: 'Draft', published: false });

const signedOut = t.procedure.use(({ next, signal }) =>
  signal.aborted ? next() : error({ code: 'UNAUTHORIZED' }),
);
const unpaid = t.procedure.use(
  t.middleware.effect()(({ next, signal }) =>
    signal.aborted
      ? next()
      : Effect.fail(error({ code: 'PLAN_REQUIRED', status: 402 })),
  ),
);

const router = {
  gated: signedOut.query(() => 'secret'),
  paid: unpaid.query(() => 'pro'),
  post: {
    byId: t.procedure.input(z.object({ id: z.string() })).query(({ input }) => {
      const post = posts.get(input.id);
      if (!post) return error({ code: 'NOT_FOUND', data: { id: input.id } });
      if (!post.published) return error({ code: 'FORBIDDEN' });
      return post;
    }),
    byIdEffect: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) =>
        Effect.gen(function* () {
          const post = posts.get(input.id);
          if (!post) {
            return yield* error({ code: 'NOT_FOUND', data: { id: input.id } });
          }
          return post;
        }),
      ),
  },
  pay: t.procedure.mutation(() =>
    error({
      code: 'PAYMENT_REQUIRED_CUSTOM',
      status: 402,
      message: 'Upgrade your plan',
      data: { plan: 'pro' as const },
    }),
  ),
  outOfStock: t.procedure.mutation(() =>
    error({ code: 'OUT_OF_STOCK', data: { sku: 'a1' } }),
  ),
  thrown: t.procedure.query((): string => {
    throw new TrpcError({ code: 'CONFLICT', message: 'Already exists' });
  }),
  crash: t.procedure.query((): string => {
    throw new Error('connect ECONNREFUSED 10.0.0.7:5432');
  }),
  effectDefect: t.procedure.query(() =>
    // @ts-expect-error -- 02 d.ii: map Effect failures to a TrpcError first
    Effect.fail(new Error('a typed failure that is not a TrpcError')),
  ),
  badOutput: t.procedure
    .output(z.object({ id: z.string() }))
    .query(() => ({ id: 1 }) as unknown as { id: string }),
};
type AppRouter = typeof router;

async function setup(opts: { expose?: boolean } = {}) {
  const errors: OnErrorOpts[] = [];
  const server = await createTestServer({
    router,
    exposeUnexpectedErrors: opts.expose ?? false,
    onError: (e) => errors.push(e),
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  return {
    server,
    client,
    errors,
    [Symbol.asyncDispose]: () => server.close(),
  };
}

test('returned errors are inferred into the union and narrow on the client', async () => {
  await using ctx = await setup();
  const [post, err] = await safe(ctx.client.post.byId.query({ id: 'nope' }));
  expect(post).toBeUndefined();
  expect(err).toBeInstanceOf(TrpcError);
  expect(err).toMatchObject({
    code: 'NOT_FOUND',
    status: 404,
    defined: true,
    data: { id: 'nope' },
  });
  if (err?.defined) {
    expectTypeOf(err.code).toEqualTypeOf<
      'NOT_FOUND' | 'FORBIDDEN' | 'BAD_REQUEST'
    >();
    if (err.code === 'NOT_FOUND') {
      expectTypeOf(err.data).toEqualTypeOf<{ id: string }>();
    }
  }

  const forbidden = await safe(ctx.client.post.byId.query({ id: '2' }));
  expect(forbidden.error).toMatchObject({ code: 'FORBIDDEN', status: 403 });

  const ok = await safe(ctx.client.post.byId.query({ id: '1' }));
  expect(ok.data).toEqual(posts.get('1'));
  expectTypeOf(ok.data).toEqualTypeOf<
    { id: string; title: string; published: boolean } | undefined
  >();
});

test('errors yielded in an Effect are inferred too', async () => {
  await using ctx = await setup();
  const { error: err } = await safe(
    ctx.client.post.byIdEffect.query({ id: 'nope' }),
  );
  expect(err).toMatchObject({ code: 'NOT_FOUND', defined: true });
  if (isDefinedError(err)) {
    expectTypeOf(err.code).toEqualTypeOf<'NOT_FOUND' | 'BAD_REQUEST'>();
  }
});

test('errors returned or failed in middleware join the union too', async () => {
  await using ctx = await setup();
  const gated = await safe(ctx.client.gated.query());
  expect(gated.error).toMatchObject({
    code: 'UNAUTHORIZED',
    status: 401,
    defined: true,
  });
  if (gated.error?.defined) {
    expectTypeOf(gated.error.code).toEqualTypeOf<'UNAUTHORIZED'>();
  }
  const paid = await safe(ctx.client.paid.query());
  expect(paid.error).toMatchObject({
    code: 'PLAN_REQUIRED',
    status: 402,
    defined: true,
  });
  if (paid.error?.defined) {
    expectTypeOf(paid.error.code).toEqualTypeOf<'PLAN_REQUIRED'>();
  }
});

test('custom codes keep their status and data', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.pay.mutate());
  expect(err).toMatchObject({
    code: 'PAYMENT_REQUIRED_CUSTOM',
    status: 402,
    message: 'Upgrade your plan',
    data: { plan: 'pro' },
    defined: true,
  });
});

test('a custom code without a status is a 400', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.outOfStock.mutate());
  expect(err).toMatchObject({ code: 'OUT_OF_STOCK', status: 400 });
  expect(new TrpcError({ code: 'ANYTHING' }).status).toBe(400);
});

test("an error's _tag is its code, so Effect.catchTag narrows on it", async () => {
  const failing = (
    id: string,
  ): Effect.Effect<
    never,
    TrpcError<'NOT_FOUND', { id: string }> | TrpcError<'FORBIDDEN', undefined>
  > =>
    id === '1'
      ? Effect.fail(error({ code: 'NOT_FOUND', data: { id } }))
      : Effect.fail(error<'FORBIDDEN', undefined>({ code: 'FORBIDDEN' }));
  const program = failing('1').pipe(
    Effect.catchTag('NOT_FOUND', (e) => Effect.succeed(`missing ${e.data.id}`)),
  );
  expectTypeOf(program).toEqualTypeOf<
    Effect.Effect<string, TrpcError<'FORBIDDEN', undefined>>
  >();
  expect(await Effect.runPromise(program)).toBe('missing 1');
  expect(error({ code: 'NOT_FOUND' })._tag).toBe('NOT_FOUND');

  await using ctx = await setup();
  const [, err] = await safe(ctx.client.post.byId.query({ id: 'nope' }));
  expect(err?._tag).toBe('NOT_FOUND');
});

test('a thrown TrpcError keeps its code but is not part of the typed union', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.thrown.query());
  expect(err).toMatchObject({
    code: 'CONFLICT',
    status: 409,
    message: 'Already exists',
    defined: false,
  });
  expectTypeOf(err!.defined).toEqualTypeOf<false>();
});

test('unexpected errors are masked, and onError sees the cause', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.crash.query());
  expect(err).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    status: 500,
    message: 'Internal server error',
    defined: false,
  });
  expect(ctx.errors).toHaveLength(1);
  expect(ctx.errors[0]!.path).toBe('crash');
  expect((ctx.errors[0]!.error.cause as Error).message).toContain(
    'ECONNREFUSED',
  );
});

test('exposeUnexpectedErrors shows the real message', async () => {
  await using ctx = await setup({ expose: true });
  const [, err] = await safe(ctx.client.crash.query());
  expect(err?.message).toContain('ECONNREFUSED');
});

test('an Effect failure that is not a TrpcError is unexpected (02 d.i)', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.effectDefect.query());
  expect(err).toMatchObject({ code: 'INTERNAL_SERVER_ERROR', defined: false });
  expectTypeOf(err!.defined).toEqualTypeOf<false>();
});

test('output validation failures are internal errors', async () => {
  await using ctx = await setup({ expose: true });
  const [, err] = await safe(ctx.client.badOutput.query());
  expect(err).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Output validation failed',
  });
});

test('createSafeClient wraps every call', async () => {
  await using ctx = await setup();
  const safeClient = createSafeClient(ctx.client);
  const [post, err] = await safeClient.post.byId.query({ id: '1' });
  expect(err).toBeUndefined();
  expect(post?.title).toBe('Hello');
  const result = await safeClient.post.byId.query({ id: 'nope' });
  expect(result.error?.code).toBe('NOT_FOUND');
});

test('calls reject with the TrpcError when not using safe()', async () => {
  await using ctx = await setup();
  await expect(
    ctx.client.post.byId.query({ id: 'nope' }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
