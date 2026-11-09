import { Context, Effect, Exit } from 'effect';
import {
  error,
  initTrpc,
  ok,
  TrpcError,
  type inferProcedureErrors,
  type inferProcedureOutput,
} from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';

interface Ctx {
  user: string | null;
}
const t = initTrpc<{ ctx: Ctx }>();
const ctx: Ctx = { user: 'ada' };

class Gone extends TrpcError.Tagged('GONE', { status: 410 }) {}

test('next() fails with the downstream error, so catchTag can map it', async () => {
  const mapped = t.procedure
    .use(
      t.middleware.effect()((opts) =>
        opts
          .next()
          .pipe(Effect.catchTag('NotFound', () => Effect.fail(new Gone()))),
      ),
    )
    .query(() => error({ code: 'NOT_FOUND' }));
  await expect(t.call(mapped, undefined, { ctx })).rejects.toMatchObject({
    code: 'GONE',
    defined: true,
  });
  expectTypeOf<inferProcedureErrors<typeof mapped>['code']>().toEqualTypeOf<
    'GONE' | 'NOT_FOUND'
  >();

  const recovered = t.procedure
    .use(
      t.middleware.effect()((opts) =>
        opts
          .next()
          .pipe(Effect.catchTag('NotFound', () => Effect.succeed(ok(null)))),
      ),
    )
    .query((opts) =>
      opts.ctx.user === 'nobody' ? null : error({ code: 'NOT_FOUND' }),
    );
  expect(await t.call(recovered, undefined, { ctx })).toBeNull();
});

test('Effect.retry on next() runs the rest of the chain again', async () => {
  let attempts = 0;
  const flaky = t.procedure
    .use(
      t.middleware.effect()((opts) =>
        opts.next().pipe(
          Effect.retry({
            times: 2,
            while: (err) => err.code === 'SERVICE_UNAVAILABLE',
          }),
        ),
      ),
    )
    .query(() =>
      ++attempts < 3 ? error({ code: 'SERVICE_UNAVAILABLE' }) : attempts,
    );
  expect(await t.call(flaky, undefined, { ctx })).toBe(3);
});

test('Effect.timeout on next() interrupts the rest of the chain', async () => {
  let interrupted = false;
  const slow = t.procedure
    .use(
      t.middleware.effect()((opts) =>
        opts.next().pipe(
          Effect.timeoutOrElse({
            duration: '1 millis',
            orElse: () => Effect.fail(new TrpcError.Timeout()),
          }),
        ),
      ),
    )
    .query(() =>
      Effect.never.pipe(
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            interrupted = true;
          }),
        ),
      ),
    );
  await expect(t.call(slow, undefined, { ctx })).rejects.toMatchObject({
    code: 'TIMEOUT',
  });
  expect(interrupted).toBe(true);
  expectTypeOf<
    inferProcedureErrors<typeof slow>['code']
  >().toEqualTypeOf<'TIMEOUT'>();
  t.middleware.effect()((opts) =>
    // @ts-expect-error -- `TimeoutError` isn't a TrpcError: map it first
    opts.next().pipe(Effect.timeout('1 millis')),
  );
});

class Tx extends Context.Service<Tx, { readonly id: number }>()('Tx') {}

test('a transaction around next() rolls back when the rest of the chain fails', async () => {
  const log: string[] = [];
  let ids = 0;
  const inTx = t.procedure.use(
    t.middleware.effect<{ provides: Tx }>()((opts) =>
      Effect.acquireUseRelease(
        Effect.sync(() => ({ id: ++ids })),
        (tx) => opts.next().pipe(Effect.provideService(Tx, tx)),
        (tx, exit) =>
          Effect.sync(() =>
            log.push(
              `${Exit.isSuccess(exit) ? 'commit' : 'rollback'} ${tx.id}`,
            ),
          ),
      ),
    ),
  );
  const create = inTx.mutation(() =>
    Effect.gen(function* () {
      return (yield* Tx).id;
    }),
  );
  const conflict = inTx.mutation(() => error({ code: 'CONFLICT' }));
  const crash = inTx.mutation(async () => {
    throw new Error('disk full');
  });

  expect(await t.call(create, undefined, { ctx })).toBe(1);
  await expect(t.call(conflict, undefined, { ctx })).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  await expect(t.call(crash, undefined, { ctx })).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
  });
  expect(log).toEqual(['commit 1', 'rollback 2', 'rollback 3']);
});

test('tapError and onExit see every failure; failing with it again keeps its cause', async () => {
  const seen: string[] = [];
  const logged = t.procedure.use(
    t.middleware.effect()((opts) =>
      opts.next().pipe(
        Effect.tapError((err) =>
          Effect.sync(() => seen.push(`${opts.path} ${err.code}`)),
        ),
        Effect.onExit((exit) =>
          Effect.sync(() => {
            if (Exit.isSuccess(exit)) seen.push(`${opts.path} ok`);
          }),
        ),
      ),
    ),
  );
  const fine = logged.query(() => 'fine');
  const thrown = logged.query(async () => {
    throw new Error('db down');
  });
  const undeclared = logged.query(async () => {
    throw new TrpcError.NotFound();
  });

  expect(await t.call(fine, undefined, { ctx, path: 'fine' })).toBe('fine');
  // A thrown value is INTERNAL_SERVER_ERROR to the middleware, and still
  // an unexpected one to the client.
  await expect(
    t.call(thrown, undefined, { ctx, path: 'thrown' }),
  ).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    defined: false,
    message: 'db down',
  });
  await expect(
    t.call(undeclared, undefined, { ctx, path: 'undeclared' }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND', defined: false });
  expect(seen).toEqual([
    'fine ok',
    'thrown INTERNAL_SERVER_ERROR',
    'undeclared NOT_FOUND',
  ]);
  expectTypeOf<inferProcedureErrors<typeof fine>>().toBeNever();
});

test('a client abort interrupts next(); it is not a failure', async () => {
  const controller = new AbortController();
  const outcomes: string[] = [];
  const watched = t.procedure
    .use(
      t.middleware.effect()((opts) =>
        opts.next().pipe(
          Effect.tapError(() => Effect.sync(() => outcomes.push('failed'))),
          Effect.onInterrupt(() =>
            Effect.sync(() => outcomes.push('interrupted')),
          ),
        ),
      ),
    )
    .query(() =>
      Effect.andThen(
        Effect.sync(() => controller.abort()),
        Effect.never,
      ),
    );
  await expect(
    t.call(watched, undefined, { ctx, signal: controller.signal }),
  ).rejects.toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  expect(outcomes).toEqual(['interrupted']);
});

test('interrupting next() reaches the steps after a Promise middleware', async () => {
  const outcomes: string[] = [];
  let settle!: () => void;
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const timed = t.procedure
    .use(
      t.middleware.effect()((opts) =>
        opts.next().pipe(
          Effect.timeoutOrElse({
            duration: '1 millis',
            orElse: () => Effect.fail(new Gone()),
          }),
        ),
      ),
    )
    .use(async (opts) => {
      const result = await opts.next();
      outcomes.push(`promise middleware ${result.ok}`);
      settle();
      return result;
    })
    .query(() =>
      Effect.never.pipe(
        Effect.onInterrupt(() =>
          Effect.sync(() => outcomes.push('resolver interrupted')),
        ),
      ),
    );
  await expect(t.call(timed, undefined, { ctx })).rejects.toMatchObject({
    code: 'GONE',
  });
  await settled;
  expect(outcomes).toEqual([
    'resolver interrupted',
    'promise middleware false',
  ]);
});

test('auth before next() and ctx for next() keep both branches typed', async () => {
  const authed = t.procedure.use(
    t.middleware.effect()((opts) =>
      opts.ctx.user
        ? opts.next({ ctx: { user: opts.ctx.user } })
        : Effect.fail(error({ code: 'UNAUTHORIZED' })),
    ),
  );
  const me = authed.query((opts) => opts.ctx.user);
  expectTypeOf<
    inferProcedureErrors<typeof me>['code']
  >().toEqualTypeOf<'UNAUTHORIZED'>();
  expectTypeOf<inferProcedureOutput<typeof me>>().toEqualTypeOf<string>();
  expect(await t.call(me, undefined, { ctx })).toBe('ada');
  await expect(
    t.call(me, undefined, { ctx: { user: null } }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED', defined: true });
});

test('next() succeeds with the output, for middleware that reads it', async () => {
  const outputs: unknown[] = [];
  const recorded = t.procedure
    .use(
      t.middleware.effect()((opts) =>
        Effect.tap(opts.next(), (result) =>
          Effect.sync(() => outputs.push(result.data)),
        ),
      ),
    )
    .query(() => ({ id: '1' }));
  expect(await t.call(recorded, undefined, { ctx })).toEqual({ id: '1' });
  expect(outputs).toEqual([{ id: '1' }]);
});

test('a body that only passes next() failures on adds no errors', () => {
  const passThrough = t.procedure
    .use(t.middleware.effect()((opts) => opts.next()))
    .use(
      t.middleware.effect()((opts) =>
        Effect.gen(function* () {
          const result = yield* opts.next();
          return result;
        }),
      ),
    )
    .use(
      t.middleware.effect()((opts) =>
        opts.next().pipe(Effect.catch((err) => Effect.fail(err))),
      ),
    )
    .query(() => 1);
  expectTypeOf<inferProcedureErrors<typeof passThrough>>().toBeNever();
});
