import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import {
  experimental_createAction,
  experimental_createCallable,
} from '@trpc12/trpc/actions';
import {
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
  const action = experimental_createAction(t, {
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
  expect(await run(form)).toStrictEqual({
    data: {
      title: 'Hello',
      draft: true,
      tags: ['a', 'b'],
      author: { age: 40 },
      by: 'ada',
    },
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

test('an action returns plain objects, which React can send to the browser', async () => {
  const run = experimental_createAction(t, { ctx: { user: null } })(createPost);
  const res = await run({
    title: 'x',
    draft: false,
    tags: [],
    author: { age: 1 },
  });
  expect(res).toStrictEqual({
    error: { code: 'FORBIDDEN', message: 'FORBIDDEN', defined: true },
  });
  expect(Object.getPrototypeOf(res.error)).toBe(Object.prototype);
  expectTypeOf(res.data).toEqualTypeOf<
    | {
        title: string;
        draft: boolean;
        tags: string[];
        author: { age: number };
        by: string;
      }
    | undefined
  >();
  if (res.error) {
    expectTypeOf(res.error.message).toEqualTypeOf<string>();
    // @ts-expect-error -- it's a plain object, not a TrpcError
    void res.error._tag;
  }
});

test("an action takes useActionState's (previous state, input) call", async () => {
  const run = experimental_createAction(t, { ctx: { user: 'ada' } })(
    createPost,
  );
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
  const anonymous = experimental_createAction(t, {
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

test('a runtime whose layer fails to build is an unexpected error, masked and seen by onError', async () => {
  const seen: unknown[] = [];
  let builds = 0;
  await using runtime = ManagedRuntime.make(
    Layer.effect(
      Clock,
      Effect.suspend(() => {
        builds++;
        return Effect.fail(new Error('the clock is down'));
      }),
    ),
  );
  const action = experimental_createAction(t, {
    ctx: { user: 'ada' },
    exposeUnexpectedErrors: false,
    runtime,
    onError: (opts) => seen.push(opts.error.cause),
  });
  for (let i = 0; i < 2; i++) {
    expect((await action(now)()).error).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
  }
  expect(seen).toEqual([
    new Error('the clock is down'),
    new Error('the clock is down'),
  ]);
  expect(builds).toBe(1);
});

test("factories share the caller's runtime, and disposing it releases its services", async () => {
  let builds = 0;
  let released = 0;
  const runtime = ManagedRuntime.make(
    Layer.effect(
      Clock,
      Effect.acquireRelease(
        Effect.sync(() => {
          builds++;
          return { now: () => 7 };
        }),
        () => Effect.sync(() => void released++),
      ),
    ),
  );
  const action = experimental_createAction(t, {
    ctx: { user: 'ada' },
    runtime,
  });
  const callable = experimental_createCallable(t, {
    ctx: { user: 'ada' },
    runtime,
    result: 'throw',
  });
  expect(await action(now)()).toEqual({ data: 7 });
  expect(await callable(now)()).toBe(7);
  expect([builds, released]).toEqual([1, 0]);
  await runtime.dispose();
  expect(released).toBe(1);
  expect((await action(now)()).error).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
  });

  void (() =>
    experimental_createAction(t, {
      // @ts-expect-error -- the factory takes a caller-owned runtime, not a layer
      layer: Layer.succeed(Clock, { now: () => 1 }),
    }));
});

test('in-process calls without a signal get one that aborts when the call is interrupted', async () => {
  const signals: AbortSignal[] = [];
  const interrupted = t.procedure
    .use((opts) => {
      signals.push(opts.signal);
      return opts.next();
    })
    .query(() => Effect.interrupt);
  const ctx: Ctx = { user: 'ada' };
  await expect(t.call(interrupted, undefined, { ctx })).rejects.toMatchObject({
    code: 'CLIENT_CLOSED_REQUEST',
  });
  await expect(
    createRouterClient(t.router({ interrupted }), { ctx }).interrupted.query(),
  ).rejects.toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  expect(
    (await experimental_createAction(t, { ctx })(interrupted)()).error,
  ).toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  await expect(
    experimental_createCallable(t, { ctx, result: 'throw' })(interrupted)(),
  ).rejects.toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  expect(signals.map((signal) => signal.aborted)).toEqual([
    true,
    true,
    true,
    true,
  ]);
});

test("result: 'throw' returns the data and throws TrpcError", async () => {
  await using runtime = ManagedRuntime.make(
    Layer.succeed(Clock, { now: () => 42 }),
  );
  const callable = experimental_createCallable(t, {
    ctx: { user: 'ada' },
    result: 'throw',
    runtime,
  });
  const value = await callable(now)();
  expectTypeOf(value).toEqualTypeOf<number>();
  expect(value).toBe(42);
  await expect(callable(conflict)()).rejects.toBeInstanceOf(TrpcError);
  await expect(callable(conflict)()).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});

test("a callable's safe result is safe()'s, with the TrpcError itself", async () => {
  const res = await experimental_createCallable(t, { ctx: { user: null } })(
    conflict,
  )();
  const [value, err] = res;
  expect(value).toBeUndefined();
  expect(err).toBeInstanceOf(TrpcError);
  expect(res.error).toBe(err);
  expect(err).toMatchObject({ code: 'CONFLICT' });
});

test('the factory must satisfy what a procedure needs', () => {
  const noCtx = experimental_createCallable(t);
  const withCtx = experimental_createCallable(t, { ctx: { user: 'ada' } });
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
  void experimental_createAction(t, { ctx: { user: 'ada' } })(createPost)(
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
  const safeAction = experimental_createAction(t, {
    ctx: { user: null },
    onError: (opts) => onError.push(opts.error),
  });
  await expect(safeAction(guarded)()).rejects.toBe(redirect);
  await expect(
    experimental_createAction(t, { ctx: { user: null }, result: 'throw' })(
      guarded,
    )(),
  ).rejects.toBe(redirect);
  expect(onError).toEqual([]);

  const caller = createRouterClient(t.router({ guarded }), {
    ctx: { user: null },
  });
  await expect(caller.guarded.mutate()).rejects.toBe(redirect);
  await expect(
    t.call(guarded, undefined, { ctx: { user: null } }),
  ).rejects.toBe(redirect);
});
