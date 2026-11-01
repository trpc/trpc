import { runInNewContext } from 'node:vm';
import { Effect } from 'effect';
import {
  createSafeClient,
  createTrpcClient,
  httpLink,
  isDefinedError,
  localLink,
  matchError,
  safe,
  TrpcError,
  routerType,
  ERROR_STATUS,
  type BuiltinError,
  type BuiltinErrorClass,
  type BuiltinErrorCode,
  type LinkErrorCode,
  type UndeclaredCode,
  type UndeclaredError,
} from '@trpc12/trpc/client';
import { experimental_contract } from '@trpc12/trpc/contract';
import {
  error,
  hasCode,
  initTrpc,
  type OnErrorOpts,
} from '@trpc12/trpc/server';
import { createTestServer } from '../fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();

const posts = new Map([['1', { id: '1', title: 'Hello', published: true }]]);
posts.set('2', { id: '2', title: 'Draft', published: false });

const signedOut = t.procedure.use((opts) =>
  opts.signal.aborted ? opts.next() : error({ code: 'UNAUTHORIZED' }),
);
class PlanRequired extends TrpcError.Tagged('PLAN_REQUIRED', {
  status: 402,
}) {}

const unpaid = t.procedure.use(
  t.middleware.effect()((opts) =>
    opts.signal.aborted ? opts.next() : Effect.fail(new PlanRequired()),
  ),
);

const router = t.router({
  gated: signedOut.query(() => 'secret'),
  paid: unpaid.query(() => 'pro'),
  post: {
    byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
      const post = posts.get(opts.input.id);
      if (!post)
        return error({ code: 'NOT_FOUND', data: { id: opts.input.id } });
      if (!post.published) return error({ code: 'FORBIDDEN' });
      return post;
    }),
    byIdEffect: t.procedure.input(z.object({ id: z.string() })).query((opts) =>
      Effect.gen(function* () {
        const post = posts.get(opts.input.id);
        if (!post) {
          return yield* error({
            code: 'NOT_FOUND',
            data: { id: opts.input.id },
          });
        }
        return post;
      }),
    ),
  },
  pay: t.procedure
    .errors({
      PAYMENT_REQUIRED_CUSTOM: {
        status: 402,
        data: z.object({ plan: z.literal('pro') }),
      },
    })
    .mutation(() =>
      error({
        code: 'PAYMENT_REQUIRED_CUSTOM',
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
  thrownWithData: t.procedure.query((): string => {
    throw new TrpcError({ code: 'CONFLICT', data: { table: 'posts' } });
  }),
  thrownCustom: t.procedure.query((): string => {
    throw new TrpcError({
      code: 'LEGACY_BILLING_TIMEOUT',
      message: 'Sold out',
      data: { retryIn: 30 },
    });
  }),
  thrownUndeclared: t.procedure
    .errors({ OUT_OF_STOCK: { data: z.object({ sku: z.string() }) } })
    .query((): string => {
      throw new TrpcError({
        code: 'LEGACY_BILLING_TIMEOUT',
        message: 'Sold out',
      });
    }),
  thrownDeclared: t.procedure
    .errors({ OUT_OF_STOCK: { data: z.object({ sku: z.string() }) } })
    .query((): string => {
      throw new TrpcError({ code: 'OUT_OF_STOCK', data: { sku: 'a1' } });
    }),
  thrownDeclaredBadData: t.procedure
    .errors({ OUT_OF_STOCK: { data: z.object({ sku: z.string() }) } })
    .query((): string => {
      throw new TrpcError({ code: 'OUT_OF_STOCK', data: { sku: 1 } });
    }),
  crash: t.procedure.query((): string => {
    throw new Error('connect ECONNREFUSED 10.0.0.7:5432');
  }),
  crossRealmCrash: t.procedure.query((): string => {
    throw runInNewContext("new Error('connect ECONNREFUSED 10.0.0.8:5432')");
  }),
  effectDefect: t.procedure.query(() =>
    // @ts-expect-error -- 02 d.ii: map Effect failures to a TrpcError first
    Effect.fail(new Error('a typed failure that is not a TrpcError')),
  ),
  badOutput: t.procedure
    .output(z.object({ id: z.string() }))
    .query(() => ({ id: 1 }) as unknown as { id: string }),
  ticks: t.procedure.subscription(async function* () {
    yield 1;
    yield 2;
  }),
});
type AppRouter = typeof router;

async function setup(opts: { expose?: boolean } = {}) {
  const errors: OnErrorOpts[] = [];
  const statuses: number[] = [];
  const server = await createTestServer({
    router,
    exposeUnexpectedErrors: opts.expose ?? false,
    onError: (e) => errors.push(e),
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({
        url: server.url,
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          statuses.push(res.status);
          return res;
        },
      }),
    ],
  });
  return {
    server,
    client,
    errors,
    /** The HTTP status of the last response. */
    status: () => statuses.at(-1),
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
    defined: true,
    data: { id: 'nope' },
  });
  expect(ctx.status()).toBe(404);
  expect(err).not.toHaveProperty('status');
  if (err?.defined) {
    expectTypeOf(err.code).toEqualTypeOf<
      'NOT_FOUND' | 'FORBIDDEN' | 'BAD_REQUEST'
    >();
    if (err.code === 'NOT_FOUND') {
      expectTypeOf(err.data).toEqualTypeOf<{ id: string }>();
    }
  }

  const forbidden = await safe(ctx.client.post.byId.query({ id: '2' }));
  expect(forbidden.error).toMatchObject({ code: 'FORBIDDEN' });
  expect(ctx.status()).toBe(403);

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
  expect(gated.error).toMatchObject({ code: 'UNAUTHORIZED', defined: true });
  expect(ctx.status()).toBe(401);
  if (gated.error?.defined) {
    expectTypeOf(gated.error.code).toEqualTypeOf<'UNAUTHORIZED'>();
  }
  const paid = await safe(ctx.client.paid.query());
  expect(paid.error).toMatchObject({ code: 'PLAN_REQUIRED', defined: true });
  expect(ctx.status()).toBe(402);
  if (paid.error?.defined) {
    expectTypeOf(paid.error.code).toEqualTypeOf<'PLAN_REQUIRED'>();
  }
});

test("custom codes keep their data, and answer with their declared spec's status", async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.pay.mutate());
  expect(ctx.status()).toBe(402);
  expect(err).toMatchObject({
    code: 'PAYMENT_REQUIRED_CUSTOM',
    message: 'Upgrade your plan',
    data: { plan: 'pro' },
    defined: true,
  });
});

test('a custom code without a status is a 400', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.outOfStock.mutate());
  expect(err).toMatchObject({ code: 'OUT_OF_STOCK' });
  expect(ctx.status()).toBe(400);
});

test('every failure has its own _tag, and Effect.catchTag narrows on it', async () => {
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
    Effect.catchTag('NotFound', (e) => Effect.succeed(`missing ${e.data.id}`)),
  );
  expectTypeOf(program).toEqualTypeOf<
    Effect.Effect<string, TrpcError<'FORBIDDEN', undefined>>
  >();
  expect(await Effect.runPromise(program)).toBe('missing 1');
  expect(error({ code: 'NOT_FOUND' })._tag).toBe('NotFound');
  expect(error({ code: 'OUT_OF_STOCK' })._tag).toBe('OUT_OF_STOCK');

  await using ctx = await setup();
  const [, err] = await safe(ctx.client.post.byId.query({ id: 'nope' }));
  expect(err?._tag).toBe('NotFound');
  const [, invalid] = await safe(
    ctx.client.post.byId.query({ id: 1 as never }),
  );
  expect(invalid?._tag).toBe('InvalidInput');
  expect(invalid).toMatchObject({ code: 'BAD_REQUEST', defined: true });
});

test('a procedure the server lacks is a NOT_FOUND tagged ProcedureNotFound, on the wire too', async () => {
  await using ctx = await setup();
  const stale = createTrpcClient({
    router: routerType<AppRouter & { gone: AppRouter['gated'] }>(),
    links: [httpLink({ url: ctx.server.url })],
  });
  const [, err] = await safe(stale.gone.query());
  expect(err?._tag).toBe('ProcedureNotFound');
  expect(err).toMatchObject({ code: 'NOT_FOUND', defined: false });
  if (err?._tag === 'ProcedureNotFound') {
    expectTypeOf(err.code).toEqualTypeOf<'NOT_FOUND'>();
  }
  const res = await fetch(`${ctx.server.url}/gone`);
  expect(await res.json()).toMatchObject({
    json: { error: { code: 'NOT_FOUND', tag: 'ProcedureNotFound' } },
  });
});

test("a failure only the server tells apart reaches clients as its code's class", async () => {
  await using ctx = await setup();
  const res = await fetch(`${ctx.server.url}/pay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  const body = (await res.json()) as { json: { error: object } };
  expect(body.json.error).toMatchObject({ code: 'PARSE_ERROR' });
  expect(body.json.error).not.toHaveProperty('tag');
  expect(ctx.errors.at(-1)?.error._tag).toBe('InvalidBody');
});

test("localLink folds a server-only tag to its code's class too, keeping it as the cause", async () => {
  const tagged = new TrpcError.BadRequest({ tag: 'InvalidBatch' });
  const local = t.router({
    thrownTagged: t.procedure.query((): string => {
      throw tagged;
    }),
  });
  const client = createTrpcClient({
    router: routerType<typeof local & { gone: typeof local.thrownTagged }>(),
    links: [localLink({ router: local })],
  });
  const [, err] = await safe(client.thrownTagged.query());
  expect(err?._tag).toBe('BadRequest');
  expect(err?.cause).toBe(tagged);
  const [, missing] = await safe(client.gone.query());
  expect(missing?._tag).toBe('ProcedureNotFound');
});

test('hasCode takes every error with a code out, whatever its tag', async () => {
  const failing: Effect.Effect<
    never,
    | TrpcError<'NOT_FOUND', { id: string }>
    | TrpcError<'NOT_FOUND', undefined, 'ProcedureNotFound'>
    | TrpcError<'FORBIDDEN', undefined>
  > = Effect.fail(new TrpcError.NotFound({ tag: 'ProcedureNotFound' }));
  const program = failing.pipe(
    Effect.catchIf(hasCode('NOT_FOUND'), (e) => Effect.succeed(e._tag)),
  );
  expectTypeOf(program).toEqualTypeOf<
    Effect.Effect<
      'NotFound' | 'ProcedureNotFound',
      TrpcError<'FORBIDDEN', undefined>
    >
  >();
  expect(await Effect.runPromise(program)).toBe('ProcedureNotFound');
});

test('a thrown TrpcError keeps its code but is not part of the typed union', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.thrown.query());
  expect(err).toMatchObject({
    code: 'CONFLICT',
    message: 'Already exists',
    defined: false,
  });
  expect(ctx.status()).toBe(409);
  expectTypeOf(err!.defined).toEqualTypeOf<false>();
});

test('a thrown built-in code loses its data, which no schema checked', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.thrownWithData.query());
  expect(err).toMatchObject({ code: 'CONFLICT', defined: false });
  expect(err?.data).toBeUndefined();
  expect(ctx.status()).toBe(409);
  expect(ctx.errors[0]!.error.cause).toMatchObject({
    data: { table: 'posts' },
  });
});

test('a custom code thrown where nothing is declared keeps its code and data, untyped', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.thrownCustom.query());
  expect(err).toMatchObject({
    code: 'LEGACY_BILLING_TIMEOUT',
    message: 'Sold out',
    data: { retryIn: 30 },
    defined: false,
  });
  expect(ctx.status()).toBe(400);
  expectTypeOf(err!).toEqualTypeOf<
    | BuiltinError<Exclude<BuiltinErrorCode, 'STREAM_INTERRUPTED'>>
    | UndeclaredError
  >();
  expect(
    matchError(err!, {
      NETWORK_ERROR: () => '',
      BAD_RESPONSE: () => '',
      unexpected: (e) => e.code,
    }),
  ).toBe('LEGACY_BILLING_TIMEOUT');
});

test('declared errors are exhaustive: a thrown undeclared custom code is masked like any other crash', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.thrownUndeclared.query());
  expect(err).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
    defined: false,
  });
  expect(ctx.status()).toBe(500);
  expect(ctx.errors[0]!.error.cause).toMatchObject({
    code: 'LEGACY_BILLING_TIMEOUT',
  });

  await using exposed = await setup({ expose: true });
  const [, shown] = await safe(exposed.client.thrownUndeclared.query());
  expect(shown).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Sold out',
  });
});

test('a thrown error with a declared code is typed, and its data validated', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.thrownDeclared.query());
  expect(err).toMatchObject({
    code: 'OUT_OF_STOCK',
    data: { sku: 'a1' },
    defined: true,
  });
  if (err?.defined) {
    expectTypeOf(err.data).toEqualTypeOf<{ sku: string }>();
  }
  const [, invalid] = await safe(ctx.client.thrownDeclaredBadData.query());
  expect(invalid).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
});

test('the union is closed: defined codes, then one member per built-in code', async () => {
  await using ctx = await setup();
  const [post, err] = await safe(ctx.client.post.byId.query({ id: 'nope' }));
  if (err) {
    expectTypeOf<
      Extract<typeof err, { defined: false }>['code']
    >().toEqualTypeOf<
      Exclude<BuiltinErrorCode, 'STREAM_INTERRUPTED'> | UndeclaredCode
    >();
    expectTypeOf<BuiltinError['data']>().toEqualTypeOf<undefined>();
    switch (err.code) {
      case 'NOT_FOUND':
        expectTypeOf(err.data).toEqualTypeOf<{ id: string } | undefined>();
        expect(err.data?.id).toBe('nope');
        break;
      case 'NETWORK_ERROR':
        expectTypeOf(err).toEqualTypeOf<BuiltinError<'NETWORK_ERROR'>>();
        break;
      default:
        expectTypeOf(err.code).not.toEqualTypeOf<string>();
    }
    return;
  }
  expectTypeOf(post).toEqualTypeOf<{
    id: string;
    title: string;
    published: boolean;
  }>();
});

test('matchError needs a handler per defined code and link code, and unexpected for the rest', async () => {
  await using ctx = await setup();
  const explain = async (id: string) => {
    const [post, err] = await safe(ctx.client.post.byId.query({ id }));
    if (!err) return post.title;
    return matchError(err, {
      NOT_FOUND: (e) => `no post ${e.data.id}`,
      FORBIDDEN: () => 'forbidden',
      BAD_REQUEST: (e) => `${e.data.issues.length} issues`,
      NETWORK_ERROR: (e) => {
        expectTypeOf(e).toEqualTypeOf<BuiltinError<'NETWORK_ERROR'>>();
        return 'offline';
      },
      BAD_RESPONSE: () => 'unreadable',
      unexpected: (e) => {
        expectTypeOf(e).toEqualTypeOf<
          | BuiltinError<Exclude<BuiltinErrorCode, LinkErrorCode>>
          | UndeclaredError
        >();
        return `unexpected ${e.code}`;
      },
    });
  };
  expectTypeOf(explain).returns.resolves.toBeString();
  expect(await explain('1')).toBe('Hello');
  expect(await explain('nope')).toBe('no post nope');
  expect(await explain('2')).toBe('forbidden');

  const [, crash] = await safe(ctx.client.crash.query());
  const rest = (err: BuiltinError | UndeclaredError) =>
    matchError(err, {
      NETWORK_ERROR: () => 'offline',
      BAD_RESPONSE: () => 'unreadable',
      STREAM_INTERRUPTED: () => 'interrupted',
      unexpected: (e) => e.code,
    });
  expect(rest(crash!)).toBe('INTERNAL_SERVER_ERROR');
  expect(rest(new TrpcError.NetworkError() as BuiltinError)).toBe('offline');
  expect(rest(new TrpcError.ClientClosedRequest() as BuiltinError)).toBe(
    'CLIENT_CLOSED_REQUEST',
  );
  expect(rest(new TrpcError.ClientError() as BuiltinError)).toBe(
    'CLIENT_ERROR',
  );
  const undeclared = new TrpcError({
    code: 'LEGACY',
  }) as unknown as UndeclaredError;
  expect(matchError(undeclared, { unexpected: (e) => e.code })).toBe('LEGACY');

  const [, missing] = await safe(ctx.client.post.byId.query({ id: 'nope' }));
  const all = {
    NOT_FOUND: () => 1,
    FORBIDDEN: () => 1,
    BAD_REQUEST: () => 1,
    NETWORK_ERROR: () => 1,
    BAD_RESPONSE: () => 1,
    unexpected: () => 1,
  } satisfies Record<string, () => number>;
  const { BAD_REQUEST: _input, ...noInput } = all;
  // @ts-expect-error: BAD_REQUEST is missing
  matchError(missing!, noInput);
  const { NETWORK_ERROR: _offline, ...noNetwork } = all;
  // @ts-expect-error: NETWORK_ERROR, which httpLink declares, is missing
  matchError(missing!, noNetwork);
  const { unexpected: _rest, ...noCatchAll } = all;
  // @ts-expect-error: the catch-all is never implied
  matchError(missing!, noCatchAll);
  matchError(missing!, {
    ...all,
    // @ts-expect-error: the procedure has no GONE error
    GONE: () => 1,
  });
  matchError(missing!, {
    ...all,
    // @ts-expect-error: there are no category keys
    unavailable: () => 1,
  });
  // The type error names the key: the type a leftover key must have is its message.
  matchError(missing!, {
    ...all,
    GONE: "'GONE' handles no error of this call",
  });

  const newer = new TrpcError({ code: 'GONE', defined: true }) as TrpcError<
    'GONE',
    undefined
  > & { readonly defined: true };
  expect(matchError(newer, { GONE: () => 'gone' })).toBe('gone');
  // @ts-expect-error: nothing is left for unexpected
  matchError(newer, { GONE: () => 'gone', unexpected: () => '' });
  const unknownToTypes = newer as unknown as BuiltinError;
  expect(rest(unknownToTypes)).toBe('GONE');
  expect(() => matchError(unknownToTypes, {} as never)).toThrow(newer);
});

test('matchError gives errors that share a code one handler', () => {
  type Both =
    | (TrpcError<'NOT_FOUND', { id: string }> & { readonly defined: true })
    | (TrpcError<'NOT_FOUND', { slug: string }> & { readonly defined: true });
  const err = new TrpcError({
    code: 'NOT_FOUND',
    data: { slug: 'a' },
    defined: true,
  }) as Both;
  expect(
    matchError(err, {
      NOT_FOUND: (e) => {
        expectTypeOf(e).toEqualTypeOf<Both>();
        return 'id' in e.data ? e.data.id : e.data.slug;
      },
    }),
  ).toBe('a');
});

test("unexpected can't be a defined code: it is matchError()'s catch-all key", () => {
  t.procedure
    // @ts-expect-error: 'unexpected' is matchError()'s catch-all key
    .errors({ unexpected: {} })
    .query(() => 1);
  experimental_contract.create().errors({
    // @ts-expect-error: 'unexpected' is matchError()'s catch-all key
    unexpected: {},
  });
  t.procedure.query(() =>
    // @ts-expect-error: 'unexpected' is matchError()'s catch-all key
    error({ code: 'unexpected' }),
  );
  // @ts-expect-error: 'unexpected' is matchError()'s catch-all key
  TrpcError.Tagged('unexpected');

  // Other codes, and codes the types don't know, still pass.
  t.procedure.errors({ UNEXPECTED: {} }).query(() => 1);
  const anyCode = (code: string) => error({ code });
  expectTypeOf(anyCode).returns.toEqualTypeOf<TrpcError<string, undefined>>();
  const declared: Record<string, {}> = {};
  t.procedure.errors(declared).query(() => 1);
});

test('every built-in code has a class', () => {
  const codes = Object.keys(ERROR_STATUS);

  const classes = Object.values(TrpcError).filter(
    (value): value is BuiltinErrorClass<BuiltinErrorCode> =>
      typeof value === 'function' && 'code' in value,
  );
  expect(classes.map((c) => c.code).sort()).toEqual([...codes].sort());
  expect(
    Object.keys(TrpcError).filter(
      (key) => /^[A-Z]/.test(key) && key !== 'Tagged',
    ),
  ).toEqual([
    'ParseError',
    'BadRequest',
    'UnsupportedProtocol',
    'Unauthorized',
    'PaymentRequired',
    'Forbidden',
    'NotFound',
    'MethodNotSupported',
    'Timeout',
    'Conflict',
    'PreconditionFailed',
    'PayloadTooLarge',
    'UnsupportedMediaType',
    'UnprocessableContent',
    'TooManyRequests',
    'ClientClosedRequest',
    'InternalServerError',
    'NotImplemented',
    'BadGateway',
    'ServiceUnavailable',
    'GatewayTimeout',
    'NetworkError',
    'BadResponse',
    'ClientError',
    'StreamInterrupted',
  ]);
  const err = new TrpcError.PayloadTooLarge({ message: 'Too big' });
  expect(err).toBeInstanceOf(TrpcError);
  expect(err._tag).toBe('PayloadTooLarge');
  const batch = new TrpcError.PayloadTooLarge({ tag: 'BatchTooLarge' });
  expect(batch._tag).toBe('BatchTooLarge');
  expectTypeOf(batch).toEqualTypeOf<
    TrpcError<'PAYLOAD_TOO_LARGE', undefined, 'BatchTooLarge'>
  >();
  // @ts-expect-error -- a tag of another code
  new TrpcError.PayloadTooLarge({ tag: 'RouteNotFound' });
  expect(err).toMatchObject({
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Too big',
    defined: false,
    data: undefined,
  });
  expectTypeOf(err).toExtend<TrpcError<'PAYLOAD_TOO_LARGE', undefined>>();
  expect(new TrpcError.Unauthorized().message).toBe('UNAUTHORIZED');
});

test('a returned built-in class is a defined error, and catchTag narrows it', async () => {
  const router = t.router({
    me: t.procedure.query((opts) =>
      opts.signal.aborted ? 'ada' : new TrpcError.Unauthorized(),
    ),
    effect: t.procedure.query(() =>
      Effect.gen(function* () {
        return yield* new TrpcError.Conflict({ message: 'Taken' });
      }).pipe(
        Effect.catchTag('Conflict', (e) => Effect.succeed(`kept ${e.message}`)),
      ),
    ),
  });
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url })],
  });
  const [, err] = await safe(client.me.query());
  expect(err).toMatchObject({ code: 'UNAUTHORIZED', defined: true });
  if (err?.defined) expectTypeOf(err.code).toEqualTypeOf<'UNAUTHORIZED'>();
  expect(await client.effect.query()).toBe('kept Taken');
});

test("safe() rethrows a framework's control-flow error", async () => {
  const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
    digest: 'NEXT_REDIRECT;replace;/login;307;',
  });
  await expect(safe(Promise.reject(redirect))).rejects.toBe(redirect);
});

test('unexpected errors are masked, and onError sees the cause', async () => {
  await using ctx = await setup();
  const [, err] = await safe(ctx.client.crash.query());
  expect(err).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
    defined: false,
  });
  expect(ctx.status()).toBe(500);
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

test("exposeUnexpectedErrors shows the message of an error from another realm, which isn't instanceof Error", async () => {
  await using ctx = await setup({ expose: true });
  const [, err] = await safe(ctx.client.crossRealmCrash.query());
  expect(err?.message).toContain('10.0.0.8');
  const cause = ctx.errors[0]!.error.cause as Error;
  expect(cause).not.toBeInstanceOf(Error);
  expect(cause.stack).toContain('ECONNREFUSED');
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

  const ticks: number[] = [];
  for await (const [tick, tickErr] of safeClient.ticks.subscribe()) {
    if (tickErr) throw tickErr;
    ticks.push(tick);
  }
  expect(ticks).toEqual([1, 2]);
});

test('calling a path instead of .query(), .mutate() or .subscribe() throws', async () => {
  await using ctx = await setup();
  const untyped = ctx.client as unknown as Record<string, any> &
    (() => unknown);
  expect(() => untyped['post'].byId()).toThrow(
    'Call .query(), .mutate() or .subscribe() on a procedure, not post.byId()',
  );
  expect(() => untyped()).toThrow(TypeError);
});

test('calls reject with the TrpcError when not using safe()', async () => {
  await using ctx = await setup();
  await expect(
    ctx.client.post.byId.query({ id: 'nope' }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
