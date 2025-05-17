import { testSolidResource } from './__helpers';
import { skipToken, useQuery } from '@tanstack/solid-query';
import '@solidjs/testing-library';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { inferRouterError } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';

const testContext = () => {
  let iterableDeferred = createDeferred<void>();
  const nextIterable = () => {
    iterableDeferred.resolve();
    iterableDeferred = createDeferred();
  };
  const t = initTRPC.create({});

  const appRouter = t.router({
    post: t.router({
      byId: t.procedure
        .input(
          z.object({
            id: z.string(),
          }),
        )
        .query(() => '__result' as const),
      byIdWithSerializable: t.procedure
        .input(
          z.object({
            id: z.string(),
          }),
        )
        .query(() => ({
          id: 1,
          date: new Date(),
        })),
      iterable: t.procedure.query(async function* () {
        for (let i = 0; i < 3; i++) {
          await iterableDeferred.promise;
          yield i + 1;
        }
      }),
    }),
  });

  return {
    ...testSolidResource(appRouter),
    nextIterable,
  };
};

describe('queryOptions', () => {
  test('basic', async () => {
    const ctx = testContext();
    try {
      const { useTRPC } = ctx;
      function MyComponent() {
        const trpc = useTRPC();
        const queryOptions = trpc.post.byId.queryOptions({ id: '1' });
        expect(queryOptions.trpc.path).toBe('post.byId');
        const query1 = useQuery(() => queryOptions);

        const query2 = useQuery(() => trpc.post.byId.queryOptions({ id: '1' }));
        expectTypeOf(query1).toMatchTypeOf(query2);

        if (!query1.data) {
          return <>...</>;
        }

        expectTypeOf(query1.data).toMatchTypeOf<'__result'>();
        expectTypeOf(query1.error).toMatchTypeOf<TRPCClientErrorLike<{
          transformer: false;
          errorShape: inferRouterError<typeof ctx.router>;
        }> | null>();

        return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
      }

      const utils = ctx.renderApp(<MyComponent />);
      await vi.waitFor(() => {
        expect(utils.container).toHaveTextContent(`__result`);
      });
    } finally {
      await ctx[Symbol.asyncDispose]();
    }
  });

  test('initialData', async () => {
    const ctx = testContext();
    try {
      const { useTRPC } = ctx;
      function MyComponent() {
        const trpc = useTRPC();
        const queryOptions = trpc.post.byId.queryOptions(
          { id: '1' },
          { initialData: '__result' },
        );
        expect(queryOptions.trpc.path).toBe('post.byId');
        const query1 = useQuery(() => queryOptions);

        expectTypeOf(query1.data).toEqualTypeOf<'__result'>();

        return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
      }

      const utils = ctx.renderApp(<MyComponent />);
      await vi.waitFor(() => {
        expect(utils.container).toHaveTextContent(`__result`);
      });
    } finally {
      await ctx[Symbol.asyncDispose]();
    }
  });

  test('disabling query with skipToken', async () => {
    const ctx = testContext();

    try {
      const { useTRPC } = ctx;
      function MyComponent() {
        const trpc = useTRPC();
        const options = trpc.post.byId.queryOptions(skipToken);
        const query1 = useQuery(() => options);

        const query2 = useQuery(() => trpc.post.byId.queryOptions(skipToken));

        expectTypeOf(query1.data).toMatchTypeOf<'__result' | undefined>();
        expectTypeOf(query2.data).toMatchTypeOf<'__result' | undefined>();

        return <pre>{query1.status}</pre>;
      }

      const utils = ctx.renderApp(<MyComponent />);
      await vi.waitFor(() => {
        expect(utils.container).toHaveTextContent(`pending`);
      });
    } finally {
      await ctx[Symbol.asyncDispose]();
    }
  });

  test('with extra `trpc` context', async () => {
    const ctx = testContext();

    try {
      const context = {
        __TEST__: true,
      };

      const { useTRPC } = ctx;
      function MyComponent() {
        const trpc = useTRPC();
        const queryOptions = trpc.post.byId.queryOptions(
          { id: '1' },
          { trpc: { context } },
        );
        expect(queryOptions.trpc.path).toBe('post.byId');
        const query1 = useQuery(() => queryOptions);

        if (!query1.data) {
          return <>...</>;
        }

        expectTypeOf(query1.data).toMatchTypeOf<'__result'>();

        return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
      }

      const utils = ctx.renderApp(<MyComponent />);
      await vi.waitFor(() => {
        expect(utils.container).toHaveTextContent(`__result`);
      });

      expect(ctx.spyLink.mock.calls[0]![0].context).toMatchObject(context);
    } finally {
      await ctx[Symbol.asyncDispose]();
    }
  });

  test('does not fetch if called from router directly', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const ctx = testContext();

    try {
      const post = await ctx.queryClient.fetchQuery(
        ctx.optionsProxyServer.post.byId.queryOptions({ id: '1' }),
      );

      expect(post).toEqual('__result');

      expect(fetchSpy).toHaveBeenCalledTimes(0);
    } finally {
      await ctx[Symbol.asyncDispose]();
    }
  });
});
