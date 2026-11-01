import { Logger, Stream } from 'effect';
import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
  TrpcError,
} from '@trpc12/trpc/client';
import {
  createRouterClient,
  error,
  initTrpc,
  type ErrorMapInput,
} from '@trpc12/trpc/server';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from '../fixtures/server.ts';

const t = initTrpc();
const quiet = initTrpc({ warnThrownErrors: false });
const OutOfStock = {
  OUT_OF_STOCK: { data: z.object({ sku: z.string() }) },
} satisfies ErrorMapInput;

const throwsNotFound = (): string => {
  throw new TrpcError.NotFound({ message: 'No post' });
};

const router = t.router({
  notFound: t.procedure.query(throwsNotFound),
  notFoundAgain: t.procedure.query(throwsNotFound),
  inProduction: t.procedure.query(throwsNotFound),
  quietNotFound: quiet.procedure.query(throwsNotFound),
  conflictWithData: t.procedure.query((): string => {
    throw new TrpcError({ code: 'CONFLICT', data: { table: 'posts' } });
  }),
  undeclared: t.procedure.errors(OutOfStock).query((): string => {
    throw new TrpcError({ code: 'SOLD_OUT' });
  }),
  quietUndeclared: quiet.procedure.errors(OutOfStock).query((): string => {
    throw new TrpcError({ code: 'SOLD_OUT' });
  }),
  fromConstructor: t.procedure.errors(OutOfStock).query((opts): string => {
    throw opts.errors.OUT_OF_STOCK({ data: { sku: 'a1' } });
  }),
  returned: t.procedure.query(() => error({ code: 'NOT_FOUND' })),
  crash: t.procedure.query((): string => {
    throw new Error('boom');
  }),
  inMiddleware: t.procedure
    .use((): never => {
      throw new TrpcError({ code: 'LEGACY_SESSION', data: { at: 'login' } });
    })
    .query(() => 'unreachable'),
  events: t.procedure.subscription(async function* () {
    yield 1;
    throw new TrpcError({ code: 'FEED_GONE', data: { feed: 'a' } });
  }),
  declaredEvents: t.procedure
    .errors(OutOfStock)
    .subscription(async function* () {
      yield 1;
      throw new TrpcError({ code: 'FEED_GONE' });
    }),
  streamed: t.procedure.query(async function* () {
    yield 1;
    throw new TrpcError({ code: 'FEED_GONE', data: { feed: 'a' } });
  }),
  streamedUndeclared: t.procedure.errors(OutOfStock).query(async function* () {
    yield 1;
    throw new TrpcError({ code: 'SOLD_OUT', data: { sku: 'a1' } });
  }),
  streamedBadData: t.procedure.errors(OutOfStock).query(async function* () {
    yield 1;
    throw new TrpcError({ code: 'OUT_OF_STOCK', data: { sku: 1 } });
  }),
  streamedBuiltin: t.procedure.query(async function* () {
    yield 1;
    throw new TrpcError({ code: 'CONFLICT', data: { table: 'posts' } });
  }),
  streamedFailure: t.procedure.query(() =>
    Stream.concat(Stream.make(1), Stream.fail(new TrpcError.Conflict())),
  ),
});

/** A server whose Effect warnings land in `warnings`, with `NODE_ENV` set to `env`. */
const failure = async (stream: AsyncIterable<number>) => {
  const seen: number[] = [];
  try {
    for await (const value of stream) seen.push(value);
  } catch (err) {
    return { seen, err };
  }
  throw new Error('the stream did not fail');
};

async function setup(env = 'development') {
  vi.stubEnv('NODE_ENV', env);
  const warnings: string[] = [];
  const capture = Logger.make((log) => {
    if (log.logLevel !== 'Warn') return;
    const parts = Array.isArray(log.message) ? log.message : [log.message];
    warnings.push(parts.join(' '));
  });
  const server = await createTestServer({
    router,
    exposeUnexpectedErrors: false,
    layer: Logger.layer([capture]),
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url })],
  });
  return {
    client,
    warnings,
    [Symbol.asyncDispose]: async () => {
      await server.close();
      vi.unstubAllEnvs();
    },
  };
}

test('a thrown TrpcError that could be returned warns once per procedure and code, with a hint for v11', async () => {
  await using ctx = await setup();
  await safe(ctx.client.notFound.query());
  await safe(ctx.client.notFound.query());
  await safe(ctx.client.notFoundAgain.query());
  expect(ctx.warnings).toHaveLength(2);
  expect(ctx.warnings[0]).toContain(
    '"notFound" threw NOT_FOUND, so clients get it untyped (defined: false)',
  );
  expect(ctx.warnings[0]).toContain(
    "v11's `throw new TRPCError()` is `return error()` now",
  );
  expect(ctx.warnings[0]).toContain('initTrpc({ warnThrownErrors: false })');

  await safe(ctx.client.conflictWithData.query());
  expect(ctx.warnings[2]).toContain(
    'untyped (defined: false) and without its data',
  );
});

test('initTrpc({ warnThrownErrors: false }) turns the hint off', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.quietNotFound.query());
  expect(err).toMatchObject({ code: 'NOT_FOUND', defined: false });
  expect(ctx.warnings).toEqual([]);
});

test('typed, returned and crashed calls do not warn', async () => {
  await using ctx = await setup();
  await safe(ctx.client.fromConstructor.query());
  await safe(ctx.client.returned.query());
  await safe(ctx.client.crash.query());
  expect(ctx.warnings).toEqual([]);
});

test('a thrown code .errors() does not declare is masked, and warns even with the hint off', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.undeclared.query());
  expect(err).toMatchObject({ code: 'INTERNAL_SERVER_ERROR', defined: false });
  await safe(ctx.client.quietUndeclared.query());
  expect(ctx.warnings).toEqual([
    `"undeclared" threw SOLD_OUT, which its .errors() don't declare, so clients get INTERNAL_SERVER_ERROR. Declare it, or use one of the declared errors.`,
    `"quietUndeclared" threw SOLD_OUT, which its .errors() don't declare, so clients get INTERNAL_SERVER_ERROR. Declare it, or use one of the declared errors.`,
  ]);
});

test('no warning outside development', async () => {
  await using ctx = await setup('production');
  await safe(ctx.client.inProduction.query());
  expect(ctx.warnings).toEqual([]);
});

test('a custom code thrown in middleware keeps its code and data', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.inMiddleware.query());
  expect(err).toMatchObject({
    code: 'LEGACY_SESSION',
    data: { at: 'login' },
    defined: false,
  });
  expect(ctx.warnings[0]).toContain('"inMiddleware" threw LEGACY_SESSION');
});

test('a subscription that throws mid-stream follows the same rules', async () => {
  await using ctx = await setup();
  const kept = await failure(ctx.client.events.subscribe());
  expect(kept.seen).toEqual([1]);
  expect(kept.err).toMatchObject({
    code: 'FEED_GONE',
    data: { feed: 'a' },
    defined: false,
  });
  const masked = await failure(ctx.client.declaredEvents.subscribe());
  expect(masked.err).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
});

test("a query's streamed output follows the same rules", async () => {
  await using ctx = await setup('production');
  const kept = await failure(await ctx.client.streamed.query());
  expect(kept.seen).toEqual([1]);
  expect(kept.err).toMatchObject({
    code: 'FEED_GONE',
    data: { feed: 'a' },
    defined: false,
  });
  const masked = await failure(await ctx.client.streamedUndeclared.query());
  expect(masked.err).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
  });
  expect(masked.err).not.toHaveProperty('data.sku');
  const invalid = await failure(await ctx.client.streamedBadData.query());
  expect(invalid.err).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  const builtin = await failure(await ctx.client.streamedBuiltin.query());
  expect(builtin.err).toMatchObject({ code: 'CONFLICT', defined: false });
  expect((builtin.err as TrpcError).data).toBeUndefined();
  const failed = await failure(await ctx.client.streamedFailure.query());
  expect(failed.err).toMatchObject({ code: 'CONFLICT', defined: true });
});

test("middleware sees a thrown error as clients will, by the procedure's declarations", async () => {
  const seen: unknown[] = [];
  const watched = t.procedure.use(async (opts) => {
    const result = await opts.next();
    if (!result.ok) seen.push(result.error);
    return result;
  });
  let made: TrpcError | undefined;
  const caller = createRouterClient(
    t.router({
      declared: watched.errors(OutOfStock).query((opts): string => {
        made = opts.errors.OUT_OF_STOCK({ data: { sku: 'a1' } });
        throw made;
      }),
      undeclared: watched.query((): string => {
        throw new TrpcError({ code: 'OUT_OF_STOCK', data: { sku: 'a1' } });
      }),
      otherConstructor: watched.query((): string => {
        throw made;
      }),
    }),
    { ctx: {} },
  );
  const [, declared] = await safe(caller.declared.query());
  expect(declared).toMatchObject({ code: 'OUT_OF_STOCK', defined: true });
  const [, undeclared] = await safe(caller.undeclared.query());
  expect(undeclared).toMatchObject({ code: 'OUT_OF_STOCK', defined: false });
  const [, other] = await safe(caller.otherConstructor.query());
  expect(other).toMatchObject({ code: 'OUT_OF_STOCK', defined: false });
  expect(seen).toMatchObject([
    { code: 'OUT_OF_STOCK', defined: true },
    { code: 'OUT_OF_STOCK', defined: false },
    { code: 'OUT_OF_STOCK', defined: false },
  ]);
});

test('declared errors are exhaustive in the types too', () => {
  t.procedure.errors(OutOfStock).query((opts) => {
    if (Math.random() > 0.5)
      return opts.errors.OUT_OF_STOCK({ data: { sku: 'a' } });
    if (Math.random() > 0.5)
      return error({ code: 'OUT_OF_STOCK', data: { sku: 'b' } });
    return 'ok';
  });
  // @ts-expect-error: NOT_FOUND isn't declared
  t.procedure.errors(OutOfStock).query(() => error({ code: 'NOT_FOUND' }));
  t.procedure
    .errors(OutOfStock)
    // @ts-expect-error: the declared OUT_OF_STOCK has data
    .mutation(() => error({ code: 'OUT_OF_STOCK' }));
  t.procedure
    .errors(OutOfStock)
    // @ts-expect-error: a subscription's returned errors are checked too
    .subscription(() => error({ code: 'GONE' }));
  t.procedure
    .errors(OutOfStock)
    // @ts-expect-error: so are a streamed output's
    .query(() => Stream.fail(error({ code: 'GONE' })));
  t.procedure
    .errors(OutOfStock)
    .query(() =>
      Stream.fail(error({ code: 'OUT_OF_STOCK', data: { sku: 'a' } })),
    );
  // Without `.errors()`, returned errors are inferred.
  t.procedure.query(() => error({ code: 'NOT_FOUND' }));
});
