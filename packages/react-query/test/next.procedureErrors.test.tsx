import { createQueryClient } from './__queryClient';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { render } from '@testing-library/react';
import { createTRPCNext } from '@trpc/next';
import { initTRPC, TRPCError } from '@trpc/server';
import type {
  inferProcedureErrorShape,
  Maybe,
} from '@trpc/server/unstable-core-do-not-import';
import type { AppType } from 'next/dist/shared/lib/utils';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';

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
});

type Root = (typeof appRouter)['_def']['_config']['$types'];
type Record = (typeof appRouter)['_def']['record'];

type LimitedShape = inferProcedureErrorShape<Root, Record['limitedQuery']>;
type PlainShape = inferProcedureErrorShape<Root, Record['plain']>;

function testContext() {
  const ctx = testServerAndClientResource(appRouter);
  const trpc = createTRPCNext<typeof appRouter>({
    config: () => ({
      ...ctx.trpcClientOptions,
      queryClient: createQueryClient(),
    }),
    ssr: false,
  });

  function renderApp(Page: AppType) {
    const Wrapped = trpc.withTRPC(Page);
    return render(<Wrapped {...({ pageProps: {} } as any)} />);
  }

  return { ...ctx, trpc, renderApp };
}

describe('createTRPCNext', () => {
  test('useQuery surfaces the procedure error union', async () => {
    await using ctx = testContext();
    const { trpc } = ctx;

    const Page: AppType = () => {
      const query = trpc.limitedQuery.useQuery(undefined, { retry: false });

      if (!query.error) {
        return <>...</>;
      }

      expectTypeOf(query.error.data).toEqualTypeOf<
        Maybe<LimitedShape['data']>
      >();

      const data = query.error.data;
      if (data && 'kind' in data) {
        expectTypeOf(data.kind).toEqualTypeOf<'RATE_LIMIT'>();
        expectTypeOf(data.retryAfterMs).toEqualTypeOf<number>();
      }

      return <pre data-testid="err">{JSON.stringify(data)}</pre>;
    };

    const utils = ctx.renderApp(Page);

    await vi.waitFor(() => {
      expect(utils.getByTestId('err')).toBeInTheDocument();
    });

    expect(JSON.parse(utils.getByTestId('err').textContent))
      .toMatchInlineSnapshot(`
      Object {
        "code": "TOO_MANY_REQUESTS",
        "httpStatus": 429,
        "kind": "RATE_LIMIT",
        "path": "limitedQuery",
        "retryAfterMs": 1234,
      }
    `);
  });

  test('useMutation surfaces the procedure error union', async () => {
    await using ctx = testContext();
    const { trpc } = ctx;

    const Page: AppType = () => {
      const mutation = trpc.limitedMutation.useMutation();

      React.useEffect(() => {
        mutation.mutate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      if (!mutation.error) {
        return <>...</>;
      }

      expectTypeOf(mutation.error.data).toEqualTypeOf<
        Maybe<LimitedShape['data']>
      >();

      return <pre data-testid="err">{JSON.stringify(mutation.error.data)}</pre>;
    };

    const utils = ctx.renderApp(Page);

    await vi.waitFor(() => {
      expect(utils.getByTestId('err')).toBeInTheDocument();
    });

    expect(JSON.parse(utils.getByTestId('err').textContent))
      .toMatchInlineSnapshot(`
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
    await using ctx = testContext();
    const { trpc } = ctx;

    const Page: AppType = () => {
      const query = trpc.plain.useQuery(undefined, { retry: false });

      if (!query.error) {
        return <>...</>;
      }

      expectTypeOf(query.error.data).toEqualTypeOf<Maybe<PlainShape['data']>>();

      // @ts-expect-error - `kind` is only on procedures with their own handler
      query.error.data?.kind;

      return <pre data-testid="err">{JSON.stringify(query.error.data)}</pre>;
    };

    const utils = ctx.renderApp(Page);

    await vi.waitFor(() => {
      expect(utils.getByTestId('err')).toBeInTheDocument();
    });

    expect(JSON.parse(utils.getByTestId('err').textContent))
      .toMatchInlineSnapshot(`
      Object {
        "code": "INTERNAL_SERVER_ERROR",
        "fromGlobalFormatter": true,
        "httpStatus": 500,
        "path": "plain",
      }
    `);
  });
});
