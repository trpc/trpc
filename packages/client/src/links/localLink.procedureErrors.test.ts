import { waitError } from '@trpc/server/__tests__/waitError';
import { initTRPC, TRPCError } from '@trpc/server';
import type {
  inferProcedureErrorShape,
  Maybe,
} from '@trpc/server/unstable-core-do-not-import';
import { describe, expect, expectTypeOf, test } from 'vitest';
import { createTRPCClient } from '../createTRPCClient';
import { TRPCClientError } from '../TRPCClientError';
import { experimental_localLink as localLink } from './localLink';

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
  limitedSubscription: rateLimited.subscription(async function* () {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      cause: new RateLimitError(9_012),
    });
    yield 'never';
  }),
});

type Root = (typeof appRouter)['_def']['_config']['$types'];
type Record = (typeof appRouter)['_def']['record'];

type LimitedShape = inferProcedureErrorShape<Root, Record['limitedQuery']>;
type PlainShape = inferProcedureErrorShape<Root, Record['plain']>;

function localClient() {
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
  test('a procedure with `.errors()` unions its shape with the router one', () => {
    const data = {} as LimitedShape['data'];

    if ('kind' in data) {
      expectTypeOf(data.kind).toEqualTypeOf<'RATE_LIMIT'>();
      expectTypeOf(data.retryAfterMs).toEqualTypeOf<number>();
    } else {
      expectTypeOf(data.fromGlobalFormatter).toEqualTypeOf<true>();
    }
  });

  test('a procedure without `.errors()` keeps the router shape', () => {
    expectTypeOf<
      PlainShape['data']['fromGlobalFormatter']
    >().toEqualTypeOf<true>();
    // @ts-expect-error - `kind` is only added by the procedure-level handler
    type _ = PlainShape['data']['kind'];
  });

  test('`subscribe()` types `onError` with the procedure shape', () => {
    localClient().limitedSubscription.subscribe(undefined, {
      onError(err) {
        expectTypeOf(err.data).toEqualTypeOf<Maybe<LimitedShape['data']>>();
      },
    });
  });
});

describe('runtime', () => {
  test('a query error carries the handler shape', async () => {
    const err = await waitError(
      localClient().limitedQuery.query(),
      TRPCClientError,
    );

    expect(err.data).toMatchInlineSnapshot(`
      Object {
        "code": "TOO_MANY_REQUESTS",
        "httpStatus": 429,
        "kind": "RATE_LIMIT",
        "path": "limitedQuery",
        "retryAfterMs": 1234,
      }
    `);
  });

  test('a mutation error carries the handler shape', async () => {
    const err = await waitError(
      localClient().limitedMutation.mutate(),
      TRPCClientError,
    );

    expect(err.data).toMatchInlineSnapshot(`
      Object {
        "code": "TOO_MANY_REQUESTS",
        "httpStatus": 429,
        "kind": "RATE_LIMIT",
        "path": "limitedMutation",
        "retryAfterMs": 5678,
      }
    `);
  });

  test('a procedure without `.errors()` falls back to the global formatter', async () => {
    const err = await waitError(localClient().plain.query(), TRPCClientError);

    expect(err.data).toMatchInlineSnapshot(`
      Object {
        "code": "INTERNAL_SERVER_ERROR",
        "fromGlobalFormatter": true,
        "httpStatus": 500,
        "path": "plain",
      }
    `);
  });

  test('a subscription error carries the handler shape', async () => {
    const errors: Maybe<LimitedShape['data']>[] = [];

    const sub = localClient().limitedSubscription.subscribe(undefined, {
      onError: (err) => {
        errors.push(err.data);
      },
    });

    await vi.waitFor(() => expect(errors).toHaveLength(1));
    sub.unsubscribe();

    expect(errors[0]).toMatchInlineSnapshot(`
      Object {
        "code": "TOO_MANY_REQUESTS",
        "httpStatus": 429,
        "kind": "RATE_LIMIT",
        "path": "limitedSubscription",
        "retryAfterMs": 9012,
      }
    `);
  });
});
