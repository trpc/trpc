import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import { describe, expectTypeOf, test } from 'vite-plus/test';
import {
  createClient,
  error,
  initTrpc,
  isTrpcError,
  mapErrors,
  safe,
  safeErrorFirst,
  safeObject,
  schema,
  type InputValidationError,
  type Issue,
  type inferProcedureErrors,
  type inferRouterErrors,
  type TrpcError,
} from './core.ts';

interface Post {
  id: string;
  title: string;
}
declare const db: {
  find(id: string): Promise<Post | undefined>;
  findAny(id: string): Promise<any>;
  findUnknown(id: string): Promise<unknown>;
};

const t = initTrpc<{ user?: { id: string } }>();

const authed = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) return error({ code: 'UNAUTHORIZED' });
  return next({ ctx: { user: ctx.user } });
});

describe('B: returned errors', () => {
  test('resolver return is split into output and errors', () => {
    const byId = t.procedure
      .input(schema<{ id: string }>())
      .query(async ({ input }) => {
        const post = await db.find(input.id);
        if (!post) return error({ code: 'NOT_FOUND', data: { id: input.id } });
        return post;
      });
    expectTypeOf(byId['~trpc'].output).toEqualTypeOf<Post>();
    expectTypeOf<inferProcedureErrors<typeof byId>>().toEqualTypeOf<
      TrpcError<'NOT_FOUND', { id: string }> | InputValidationError
    >();
  });

  test('middleware errors and ctx are both inferred and flow through the chain', () => {
    const proc = authed
      .use(async ({ ctx, next }) => {
        if (ctx.user.id === 'banned') return error({ code: 'FORBIDDEN' });
        return next({ ctx: { role: 'admin' as const } });
      })
      .query(({ ctx }) => ({ by: ctx.user.id, role: ctx.role }));
    expectTypeOf(proc['~trpc'].output).toEqualTypeOf<{
      by: string;
      role: 'admin';
    }>();
    expectTypeOf<inferProcedureErrors<typeof proc>>().toEqualTypeOf<
      TrpcError<'UNAUTHORIZED', undefined> | TrpcError<'FORBIDDEN', undefined>
    >();
  });

  test('split inference (`useSplit`) gives the same result', () => {
    const proc = t.procedure
      .useSplit(async ({ ctx, next }) => {
        if (!ctx.user) return error({ code: 'UNAUTHORIZED' });
        return next({ ctx: { user: ctx.user } });
      })
      .query(({ ctx }) => ctx.user.id);
    expectTypeOf(proc['~trpc'].output).toEqualTypeOf<string>();
    expectTypeOf<inferProcedureErrors<typeof proc>>().toEqualTypeOf<
      TrpcError<'UNAUTHORIZED', undefined>
    >();
  });

  test('same code with different data stays two members', () => {
    const proc = t.procedure.query(() => {
      if (Math.random() > 0.5)
        return error({ code: 'NOT_FOUND', data: { id: 'x' } });
      if (Math.random() > 0.5)
        return error({ code: 'NOT_FOUND', data: { slug: 'y' } });
      return 1;
    });
    expectTypeOf<inferProcedureErrors<typeof proc>>().toEqualTypeOf<
      | TrpcError<'NOT_FOUND', { id: string }>
      | TrpcError<'NOT_FOUND', { slug: string }>
    >();
  });

  test('errors returned from helpers propagate with an `isTrpcError` guard', () => {
    async function loadPost(id: string) {
      const post = await db.find(id);
      return post ?? error({ code: 'NOT_FOUND', data: { id } });
    }
    const proc = t.procedure.query(async () => {
      const post = await loadPost('1');
      if (isTrpcError(post)) return post;
      return post.title;
    });
    expectTypeOf(proc['~trpc'].output).toEqualTypeOf<string>();
    expectTypeOf<inferProcedureErrors<typeof proc>>().toEqualTypeOf<
      TrpcError<'NOT_FOUND', { id: string }>
    >();
  });

  test('`.output()` still accepts returned errors and rejects wrong outputs', () => {
    const proc = t.procedure.output(schema<Post>()).query(async () => {
      const post = await db.find('1');
      return post ?? error({ code: 'NOT_FOUND' });
    });
    expectTypeOf(proc['~trpc'].output).toEqualTypeOf<Post>();
    expectTypeOf<inferProcedureErrors<typeof proc>>().toEqualTypeOf<
      TrpcError<'NOT_FOUND', undefined>
    >();

    // @ts-expect-error -- not a Post
    t.procedure.output(schema<Post>()).query(() => ({ id: 1 }));
  });

  test('pitfall: thrown errors are not inferred', () => {
    const proc = t.procedure.query(() => {
      if (Math.random() > 0.5) throw error({ code: 'NOT_FOUND' });
      return 1;
    });
    expectTypeOf<inferProcedureErrors<typeof proc>>().toBeNever();
  });

  test('pitfall guard: `any` outputs do not turn the error union into `any`', () => {
    const proc = t.procedure.query(async () => {
      const row = await db.findAny('1');
      if (!row) return error({ code: 'NOT_FOUND' });
      return row;
    });
    expectTypeOf(proc['~trpc'].output).toBeAny();
    // The error union is lost too: `any | TrpcError` is `any`.
    expectTypeOf<inferProcedureErrors<typeof proc>>().toBeNever();
  });

  test('pitfall: `unknown`/`{}` outputs swallow returned errors (subtype reduction)', () => {
    const proc = t.procedure.query(async () => {
      const row = await db.findUnknown('1');
      if (!row) return error({ code: 'NOT_FOUND' });
      return row;
    });
    // `if (!row)` narrows `unknown` to `{}`, and every `TrpcError` is a `{}`.
    expectTypeOf(proc['~trpc'].output).toEqualTypeOf<{}>();
    expectTypeOf<inferProcedureErrors<typeof proc>>().toBeNever();

    const obj = t.procedure.query(() => {
      if (Math.random() > 0.5) return error({ code: 'NOT_FOUND' });
      return {} as object;
    });
    expectTypeOf<inferProcedureErrors<typeof obj>>().toBeNever();
  });
});

describe('A: declared errors', () => {
  test('declared map adds to the union and types `errors.*` constructors', () => {
    const proc = authed
      .errors({
        PAYMENT_REQUIRED: { status: 402, data: schema<{ plan: string }>() },
      })
      .query(({ errors }) => {
        expectTypeOf(errors.PAYMENT_REQUIRED).parameter(0).toEqualTypeOf<{
          message?: string;
          data: { plan: string };
        }>();
        if (Math.random() > 0.5)
          throw errors.PAYMENT_REQUIRED({ data: { plan: 'pro' } });
        return 'ok';
      });
    expectTypeOf<inferProcedureErrors<typeof proc>>().toEqualTypeOf<
      | TrpcError<'UNAUTHORIZED', undefined>
      | TrpcError<'PAYMENT_REQUIRED', { plan: string }>
    >();
  });

  test('declared and returned members with the same type are deduplicated', () => {
    const proc = t.procedure
      .errors({ CONFLICT: {} })
      .query(({ errors }) => (Math.random() > 0.5 ? errors.CONFLICT() : 1));
    expectTypeOf<inferProcedureErrors<typeof proc>>().toEqualTypeOf<
      TrpcError<'CONFLICT', undefined>
    >();
  });
});

describe('mapping middleware', () => {
  class RateLimitError extends Error {
    retryAfterMs = 1000;
  }
  test('`mapErrors` return type is inferred into the union; `undefined` is dropped', () => {
    const proc = t.procedure
      .use(
        mapErrors((cause) =>
          cause instanceof RateLimitError
            ? error({
                code: 'TOO_MANY_REQUESTS',
                data: { retryAfterMs: cause.retryAfterMs },
              })
            : undefined,
        ),
      )
      .query(() => 1);
    expectTypeOf<inferProcedureErrors<typeof proc>>().toEqualTypeOf<
      TrpcError<'TOO_MANY_REQUESTS', { retryAfterMs: number }>
    >();
  });
});

class DbError extends Data.TaggedError('DbError')<{ cause: unknown }> {}
declare const findPost: (
  id: string,
) => Effect.Effect<Post | undefined, DbError>;

describe('Effect `E` channel', () => {
  test('`return yield* error(...)` is inferred like a returned error', () => {
    const proc = t.procedure
      .input(schema<{ id: string }>())
      .query(({ input }) =>
        Effect.gen(function* () {
          const post = yield* findPost(input.id).pipe(
            Effect.catchTag('DbError', () =>
              error({ code: 'INTERNAL_SERVER_ERROR' }),
            ),
          );
          if (!post)
            return yield* error({ code: 'NOT_FOUND', data: { id: input.id } });
          return post;
        }),
      );
    expectTypeOf(proc['~trpc'].output).toEqualTypeOf<Post>();
    expectTypeOf<inferProcedureErrors<typeof proc>>().toEqualTypeOf<
      | TrpcError<'INTERNAL_SERVER_ERROR', undefined>
      | TrpcError<'NOT_FOUND', { id: string }>
      | InputValidationError
    >();
  });

  test('a returned `TrpcError` is an `Effect`, so both rules agree', () => {
    const plain = t.procedure.query(() => error({ code: 'CONFLICT' }));
    const effect = t.procedure.query(() =>
      Effect.fail(error({ code: 'CONFLICT' })),
    );
    expectTypeOf<inferProcedureErrors<typeof plain>>().toEqualTypeOf<
      inferProcedureErrors<typeof effect>
    >();
    expectTypeOf(plain['~trpc'].output).toBeNever();
  });

  test('02 (d.ii): an unmapped typed failure is a compile error on the resolver', () => {
    t.procedure.query(() =>
      // @ts-expect-error -- DbError is not a TrpcError
      Effect.gen(function* () {
        return yield* findPost('1');
      }),
    );
  });
});

describe('client', () => {
  const appRouter = {
    post: {
      byId: authed.input(schema<{ id: string }>()).query(async ({ input }) => {
        const post = await db.find(input.id);
        return post ?? error({ code: 'NOT_FOUND', data: { id: input.id } });
      }),
    },
  };
  type AppRouter = typeof appRouter;
  const client = createClient<AppRouter>();

  test('router-level helper', () => {
    expectTypeOf<inferRouterErrors<AppRouter>['code']>().toEqualTypeOf<
      'UNAUTHORIZED' | 'NOT_FOUND' | 'BAD_REQUEST'
    >();
  });

  test('narrow by `defined`, then `code` gives typed data', async () => {
    const [data, err] = await safe(client.post.byId.query({ id: '1' }));
    if (err) {
      if (err.defined) {
        if (err.code === 'NOT_FOUND')
          expectTypeOf(err.data).toEqualTypeOf<{ id: string }>();
        if (err.code === 'BAD_REQUEST')
          expectTypeOf(err.data.issues).toEqualTypeOf<readonly Issue[]>();
      } else {
        expectTypeOf(err.data).toBeUnknown();
      }
      return;
    }
    expectTypeOf(data).toEqualTypeOf<Post>();
  });

  test('pitfall: narrowing by `code` alone mixes in the unexpected branch', async () => {
    const [, err] = await safe(client.post.byId.query({ id: '1' }));
    if (err?.code === 'NOT_FOUND')
      expectTypeOf(err.data).toEqualTypeOf<unknown>();
  });

  test('Q7.3 shapes all narrow', async () => {
    const [error1, data1, isDefined] = await safeErrorFirst(
      client.post.byId.query({ id: '1' }),
    );
    if (isDefined)
      expectTypeOf(error1.code).toEqualTypeOf<
        'UNAUTHORIZED' | 'NOT_FOUND' | 'BAD_REQUEST'
      >();
    else if (error1 === null) expectTypeOf(data1).toEqualTypeOf<Post>();

    const res = await safeObject(client.post.byId.query({ id: '1' }));
    if (res.error) expectTypeOf(res.data).toBeUndefined();
    else expectTypeOf(res.data).toEqualTypeOf<Post>();
  });

  test('pitfall: the error phantom is lost through `async` wrappers', async () => {
    const wrapped = async () => client.post.byId.query({ id: '1' });
    const [, err] = await safe(wrapped());
    expectTypeOf(err).toEqualTypeOf<unknown>();
  });
});
