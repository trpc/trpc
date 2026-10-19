import { initTRPC, TRPCError } from '@trpc/server';
import type {
  inferProcedureErrorShape,
  Maybe,
} from '@trpc/server/unstable-core-do-not-import';
import { describe, expect, expectTypeOf, test } from 'vitest';
import { createTRPCClient } from './createTRPCClient';
import { experimental_localLink as localLink } from './links/localLink';
import { safe } from './safe';
import { TRPCClientError } from './TRPCClientError';

class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Too many requests');
  }
}

const t = initTRPC.create({
  // keeps the stack out of the snapshots
  isDev: false,
  errorFormatter: (opts) => ({
    ...opts.shape,
    data: { ...opts.shape.data, fromGlobalFormatter: true as const },
  }),
});

const rateLimited = t.procedure.errors((opts) => {
  if (opts.error.cause instanceof RateLimitError) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        kind: 'RATE_LIMIT' as const,
        retryAfterMs: opts.error.cause.retryAfterMs,
      },
    };
  }
  return undefined;
});

const appRouter = t.router({
  ok: rateLimited.query(() => 'hello'),
  plain: t.procedure.query((): string => {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Fails' });
  }),
  limitedQuery: rateLimited.query((): string => {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      cause: new RateLimitError(1_234),
    });
  }),
  limitedMutation: rateLimited.mutation((): string => {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      cause: new RateLimitError(5_678),
    });
  }),
});

type Root = (typeof appRouter)['_def']['_config']['$types'];
type Record = (typeof appRouter)['_def']['record'];

type LimitedShape = inferProcedureErrorShape<Root, Record['limitedQuery']>;
type PlainShape = inferProcedureErrorShape<Root, Record['plain']>;

function client() {
  return createTRPCClient<typeof appRouter>({
    links: [
      localLink({
        router: appRouter,
        createContext: async () => ({}),
      }),
    ],
  });
}

describe('types', () => {
  test('only accepts a promise from a tRPC call', () => {
    // @ts-expect-error - a plain promise carries no error shape to report
    void safe(Promise.resolve('hello'));
  });
});

describe('runtime', () => {
  test('hands back the data on success', async () => {
    const [data, error] = await safe(client().ok.query());

    expectTypeOf(data).toEqualTypeOf<string | undefined>();

    if (error) {
      throw new Error('expected no error');
    }

    // ...and the absent error narrows the data
    expectTypeOf(data).toEqualTypeOf<string>();
    expect(data).toMatchInlineSnapshot(`"hello"`);
  });

  test('hands back the procedure error union instead of throwing', async () => {
    const [data, error] = await safe(client().limitedQuery.query());

    if (!error) {
      throw new Error('expected an error');
    }

    // ...and the error narrows the data away
    expectTypeOf(data).toEqualTypeOf<undefined>();
    expectTypeOf(error.data).toEqualTypeOf<Maybe<LimitedShape['data']>>();
    expect(error).toBeInstanceOf(TRPCClientError);

    expect(error.data).toMatchInlineSnapshot(`
      Object {
        "code": "TOO_MANY_REQUESTS",
        "httpStatus": 429,
        "kind": "RATE_LIMIT",
        "path": "limitedQuery",
        "retryAfterMs": 1234,
      }
    `);
  });

  test('works for mutations too', async () => {
    const [, error] = await safe(client().limitedMutation.mutate());

    expectTypeOf(error?.data).toEqualTypeOf<
      Maybe<LimitedShape['data']> | undefined
    >();

    expect(error?.data).toMatchInlineSnapshot(`
      Object {
        "code": "TOO_MANY_REQUESTS",
        "httpStatus": 429,
        "kind": "RATE_LIMIT",
        "path": "limitedMutation",
        "retryAfterMs": 5678,
      }
    `);
  });

  test('a procedure without `.errors()` keeps the router shape', async () => {
    const [, error] = await safe(client().plain.query());

    expectTypeOf(error?.data).toEqualTypeOf<
      Maybe<PlainShape['data']> | undefined
    >();

    expect(error?.data).toMatchInlineSnapshot(`
      Object {
        "code": "INTERNAL_SERVER_ERROR",
        "fromGlobalFormatter": true,
        "httpStatus": 500,
        "path": "plain",
      }
    `);
  });
});
