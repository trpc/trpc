import { Context, Effect, Layer } from 'effect';
import {
  experimental_createAction,
  experimental_createCallable,
} from '@trpc12/trpc/actions';
import {
  call,
  createRouterClient,
  error,
  initTrpc,
  TrpcError,
} from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

interface Ctx {
  user: string | null;
}
const t = initTrpc<{ ctx: Ctx }>();

class Clock extends Context.Service<Clock, { now: () => number }>()('Clock') {}

const createPost = t.procedure
  .errors({ FORBIDDEN: {} })
  .input(
    z.object({
      title: z.string().min(1),
      draft: z.boolean(),
      tags: z.array(z.string()),
      author: z.object({ age: z.number() }),
    }),
  )
  .mutation((opts) => {
    const { input } = opts;
    if (!opts.ctx.user) return opts.errors.FORBIDDEN();
    return { ...input, by: opts.ctx.user };
  });
const boom = t.procedure.query((): string => {
  throw new Error('db password is hunter2');
});
const now = t.procedure.query(() =>
  Effect.gen(function* () {
    return (yield* Clock).now();
  }),
);
const conflict = t.procedure.query(() => error({ code: 'CONFLICT' }));
const tick = t.procedure.subscription(async function* () {
  yield 1;
});

test('experimental_createAction: FormData in, a safe result out (15 Q15.3)', async () => {
  const action = experimental_createAction({
    ctx: async () => ({ user: 'ada' }),
  });
  const run = action(createPost);

  const form = new FormData();
  form.set('$ACTION_ID_abc', '');
  form.set('title', 'Hello');
  form.set('draft', 'true');
  form.append('tags[]', 'a');
  form.append('tags[]', 'b');
  form.set('author[age]', '40');
  const [post, err] = await run(form);
  expect(err).toBeUndefined();
  expect(post).toEqual({
    title: 'Hello',
    draft: true,
    tags: ['a', 'b'],
    author: { age: 40 },
    by: 'ada',
  });

  const typed = await run({
    title: 'x',
    draft: false,
    tags: [],
    author: { age: 1 },
  });
  expect(typed.data?.by).toBe('ada');

  const invalid = await run({
    title: '',
    draft: false,
    tags: [],
    author: { age: 1 },
  });
  expect(invalid.error).toMatchObject({ code: 'BAD_REQUEST', defined: true });
  if (invalid.error?.defined && invalid.error.code === 'BAD_REQUEST') {
    expect(invalid.error.data.issues[0]!.path).toEqual(['title']);
  }
});

test("an action takes useActionState's (previous state, input) call", async () => {
  const run = experimental_createAction({ ctx: { user: 'ada' } })(createPost);
  const form = new FormData();
  form.set('title', 'Hi');
  form.set('draft', 'false');
  form.append('tags[]', 'news');
  form.set('author[age]', '3');
  const first = await run(undefined, form);
  expect(first?.data).toMatchObject({ title: 'Hi', by: 'ada' });
  const second = await run(first, {
    title: '',
    draft: false,
    tags: [],
    author: { age: 1 },
  });
  expect(second?.error).toMatchObject({ code: 'BAD_REQUEST' });
  expectTypeOf(second).toEqualTypeOf<
    Awaited<ReturnType<typeof run>> | undefined
  >();
  // @ts-expect-error the payload is the input or FormData
  void run(undefined, { title: 1 });
});

test('defined errors are typed; unexpected ones are masked unless exposed', async () => {
  const seen: string[] = [];
  const anonymous = experimental_createAction({
    ctx: { user: null },
    exposeUnexpectedErrors: false,
    onError: (opts) => seen.push(opts.error.message),
  });
  const res = await anonymous(createPost)({
    title: 'x',
    draft: false,
    tags: [],
    author: { age: 1 },
  });
  if (res.error?.defined) {
    expectTypeOf(res.error.code).toEqualTypeOf<'FORBIDDEN' | 'BAD_REQUEST'>();
  }
  expect(res.error).toMatchObject({ code: 'FORBIDDEN', defined: true });

  const masked = await anonymous(boom)();
  expect(masked.error).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
  });
  expect(seen).toContain('db password is hunter2');
});

test("result: 'throw' returns the data and throws TrpcError", async () => {
  const callable = experimental_createCallable({
    ctx: { user: 'ada' },
    result: 'throw',
    layer: Layer.succeed(Clock, { now: () => 42 }),
  });
  const value = await callable(now)();
  expectTypeOf(value).toEqualTypeOf<number>();
  expect(value).toBe(42);
  await expect(callable(conflict)()).rejects.toBeInstanceOf(TrpcError);
  await expect(callable(conflict)()).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});

test('the factory must satisfy what a procedure needs', () => {
  const noCtx = experimental_createCallable();
  const withCtx = experimental_createCallable({ ctx: { user: 'ada' } });
  void (() => {
    // @ts-expect-error -- createPost needs { user }
    noCtx(createPost);
    // @ts-expect-error -- `now` needs Clock, which the factory doesn't provide
    withCtx(now);
    // @ts-expect-error -- subscriptions can't be actions
    withCtx(tick);
    // @ts-expect-error -- callables don't take FormData
    void withCtx(createPost)(new FormData());
  });
  void experimental_createAction({ ctx: { user: 'ada' } })(createPost)(
    new FormData(),
  );
});

test("Next's redirect() and notFound() pass through in-process calls unchanged", async () => {
  const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
    digest: 'NEXT_REDIRECT;replace;/login;307;',
  });
  const guarded = t.procedure.mutation(() => {
    throw redirect;
  });
  const onError: unknown[] = [];
  const safeAction = experimental_createAction({
    ctx: { user: null },
    onError: (opts) => onError.push(opts.error),
  });
  await expect(safeAction(guarded)()).rejects.toBe(redirect);
  await expect(
    experimental_createAction({ ctx: { user: null }, result: 'throw' })(
      guarded,
    )(),
  ).rejects.toBe(redirect);
  expect(onError).toEqual([]);

  const caller = createRouterClient({ guarded }, { ctx: { user: null } });
  await expect(caller.guarded.mutate()).rejects.toBe(redirect);
  await expect(call(guarded, undefined, { ctx: { user: null } })).rejects.toBe(
    redirect,
  );
});
