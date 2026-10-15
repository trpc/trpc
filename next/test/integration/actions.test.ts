import { Context, Effect, Layer } from 'effect';
import { createAction, createCallable } from 'trpcdev/actions';
import {
  call,
  createRouterClient,
  error,
  initTrpc,
  TrpcError,
} from 'trpcdev/server';
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
  .mutation(({ ctx, input, errors }) => {
    if (!ctx.user) return errors.FORBIDDEN();
    return { ...input, by: ctx.user };
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

test('createAction: FormData in, a safe result out (15 Q15.3)', async () => {
  const action = createAction({ ctx: async () => ({ user: 'alex' }) });
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
    by: 'alex',
  });

  const typed = await run({
    title: 'x',
    draft: false,
    tags: [],
    author: { age: 1 },
  });
  expect(typed.data?.by).toBe('alex');

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

test('defined errors are typed; unexpected ones are masked unless exposed', async () => {
  const seen: string[] = [];
  const anonymous = createAction({
    ctx: { user: null },
    exposeUnexpectedErrors: false,
    onError: ({ error }) => seen.push(error.message),
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
  const callable = createCallable({
    ctx: { user: 'alex' },
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
  const noCtx = createCallable();
  const withCtx = createCallable({ ctx: { user: 'alex' } });
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
  void createAction({ ctx: { user: 'alex' } })(createPost)(new FormData());
});

test("Next's redirect() and notFound() pass through in-process calls unchanged", async () => {
  const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
    digest: 'NEXT_REDIRECT;replace;/login;307;',
  });
  const guarded = t.procedure.mutation(() => {
    throw redirect;
  });
  const onError: unknown[] = [];
  const safeAction = createAction({
    ctx: { user: null },
    onError: ({ error }) => onError.push(error),
  });
  await expect(safeAction(guarded)()).rejects.toBe(redirect);
  await expect(
    createAction({ ctx: { user: null }, result: 'throw' })(guarded)(),
  ).rejects.toBe(redirect);
  expect(onError).toEqual([]);

  const caller = createRouterClient({ guarded }, { ctx: { user: null } });
  await expect(caller.guarded.mutate()).rejects.toBe(redirect);
  await expect(call(guarded, undefined, { ctx: { user: null } })).rejects.toBe(
    redirect,
  );
});
