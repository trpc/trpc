import { testReactResource } from './__helpers';
import { useMutation, useQuery } from '@tanstack/react-query';
import '@testing-library/react';
import { initTRPC, TRPCError } from '@trpc/server';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';

class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Too many requests');
  }
}

const testContext = () => {
  const t = initTRPC.create({
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
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
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

  return testReactResource(appRouter);
};

describe('procedure-level .errors()', () => {
  test('queryOptions surfaces the procedure error union', async () => {
    await using ctx = testContext();
    const { useTRPC } = ctx;

    function MyComponent() {
      const trpc = useTRPC();
      const query = useQuery({
        ...trpc.limitedQuery.queryOptions(),
        retry: false,
      });

      if (!query.error) {
        return <>...</>;
      }

      const data = query.error.data;
      if (data && 'kind' in data) {
        expectTypeOf(data.kind).toEqualTypeOf<'RATE_LIMIT'>();
        expectTypeOf(data.retryAfterMs).toEqualTypeOf<number>();
        return <pre>{`${data.kind}:${data.retryAfterMs}`}</pre>;
      }

      return <pre>no-kind</pre>;
    }

    const utils = ctx.renderApp(<MyComponent />);
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('RATE_LIMIT:1234');
    });
  });

  test('mutationOptions surfaces the procedure error union', async () => {
    await using ctx = testContext();
    const { useTRPC } = ctx;

    function MyComponent() {
      const trpc = useTRPC();
      const mutation = useMutation(trpc.limitedMutation.mutationOptions());

      React.useEffect(() => {
        mutation.mutate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      const data = mutation.error?.data;
      if (data && 'kind' in data) {
        expectTypeOf(data.kind).toEqualTypeOf<'RATE_LIMIT'>();
        return <pre>{`${data.kind}:${data.retryAfterMs}`}</pre>;
      }

      return <pre>pending</pre>;
    }

    const utils = ctx.renderApp(<MyComponent />);
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('RATE_LIMIT:5678');
    });
  });

  test('procedures without their own formatter keep the router error shape', async () => {
    await using ctx = testContext();
    const { useTRPC } = ctx;

    function MyComponent() {
      const trpc = useTRPC();
      const query = useQuery({
        ...trpc.plain.queryOptions(),
        retry: false,
      });

      if (!query.error) {
        return <>...</>;
      }

      const data = query.error.data;
      // @ts-expect-error - `kind` is only on procedures with their own formatter
      data?.kind;

      return <pre>{`${data?.fromGlobalFormatter}`}</pre>;
    }

    const utils = ctx.renderApp(<MyComponent />);
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('true');
    });
  });
});
