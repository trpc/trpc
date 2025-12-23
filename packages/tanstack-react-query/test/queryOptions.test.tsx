import { testReactResource } from './__helpers';
import { skipToken, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import '@testing-library/react';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { inferRouterError } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';

type Post = {
  id: string;
  title: string;
};

const testContext = (keyPrefix?: string) => {
  let iterableDeferred = createDeferred<void>();
  const nextIterable = () => {
    iterableDeferred.resolve();
    iterableDeferred = createDeferred();
  };
  const t = initTRPC.create({});

  const posts: Post[] = [{ id: '1', title: 'Hello world' }];

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
      list: t.procedure.query(() => posts),
    }),
  });

  return {
    ...testReactResource(appRouter, {
      keyPrefix,
    }),
    nextIterable,
  };
};

describe.each(['user-123', undefined])(
  'queryOptions with keyPrefix: %s',
  (keyPrefix) => {
    test('basic', async () => {
      await using ctx = testContext(keyPrefix);

      const { useTRPC } = ctx;
      function MyComponent() {
        const trpc = useTRPC();
        const queryOptions = trpc.post.byId.queryOptions({ id: '1' });
        expect(queryOptions.trpc.path).toBe('post.byId');
        const query1 = useQuery(queryOptions);

        const query2 = useQuery(trpc.post.byId.queryOptions({ id: '1' }));
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
    });

    test('select', async () => {
      await using ctx = testContext(keyPrefix);

      const { useTRPC } = ctx;
      function MyComponent() {
        const trpc = useTRPC();
        const queryOptions = trpc.post.byId.queryOptions(
          { id: '1' },
          {
            select: (data) => `mutated${data}` as const,
          },
        );
        expect(queryOptions.trpc.path).toBe('post.byId');
        const query1 = useQuery(queryOptions);

        if (!query1.data) {
          return <>...</>;
        }

        expectTypeOf(query1.data).toMatchTypeOf<'mutated__result'>();

        return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
      }

      const utils = ctx.renderApp(<MyComponent />);
      await vi.waitFor(() => {
        expect(utils.container).toHaveTextContent(`mutated__result`);
      });
    });

    test('initialData', async () => {
      await using ctx = testContext(keyPrefix);

      const { useTRPC } = ctx;
      function MyComponent() {
        const trpc = useTRPC();
        const queryOptions = trpc.post.byId.queryOptions(
          { id: '1' },
          { initialData: '__result' },
        );
        expect(queryOptions.trpc.path).toBe('post.byId');
        const query1 = useQuery(queryOptions);

        expectTypeOf(query1.data).toEqualTypeOf<'__result'>();

        return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
      }

      const utils = ctx.renderApp(<MyComponent />);
      await vi.waitFor(() => {
        expect(utils.container).toHaveTextContent(`__result`);
      });
    });

    test('disabling query with skipToken', async () => {
      await using ctx = testContext(keyPrefix);

      const { useTRPC } = ctx;
      function MyComponent() {
        const trpc = useTRPC();
        const options = trpc.post.byId.queryOptions(skipToken);
        const query1 = useQuery(options);

        const query2 = useQuery(trpc.post.byId.queryOptions(skipToken));

        expectTypeOf(query1.data).toMatchTypeOf<'__result' | undefined>();
        expectTypeOf(query2.data).toMatchTypeOf<'__result' | undefined>();

        return <pre>{query1.status}</pre>;
      }

      const utils = ctx.renderApp(<MyComponent />);
      await vi.waitFor(() => {
        expect(utils.container).toHaveTextContent(`pending`);
      });
    });

    test('with extra `trpc` context', async () => {
      await using ctx = testContext(keyPrefix);

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
        const query1 = useQuery(queryOptions);

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

      expect(ctx.linkSpy.up.mock.calls[0]![0].context).toMatchObject(context);
    });

    test('iterable', async () => {
      await using ctx = testContext(keyPrefix);

      const { useTRPC } = ctx;
      const states: {
        status: string;
        data: unknown;
        fetchStatus: string;
      }[] = [];
      const selects: number[][] = [];

      function MyComponent() {
        const trpc = useTRPC();
        const opts = trpc.post.iterable.queryOptions(undefined, {
          select(data) {
            expectTypeOf<number[]>(data);
            selects.push(data);
            return data;
          },
          trpc: {
            context: {
              stream: 1,
            },
          },
        });
        const query1 = useQuery(opts);
        states.push({
          status: query1.status,
          data: query1.data,
          fetchStatus: query1.fetchStatus,
        });
        ctx.nextIterable();

        expectTypeOf(query1.data).toEqualTypeOf<undefined | number[]>();

        return (
          <pre>
            {query1.status}:{query1.fetchStatus}
          </pre>
        );
      }

      const utils = ctx.renderApp(<MyComponent />);
      await vi.waitFor(() => {
        expect(utils.container).toHaveTextContent(`success:idle`);
      });

      expect(selects).toEqual([
        [],
        [],
        [1],
        [1],
        [1, 2],
        [1, 2],
        [1, 2, 3],
        [1, 2, 3],
      ]);

      expect(states.map((s) => [s.status, s.fetchStatus])).toEqual([
        // initial
        ['pending', 'fetching'],
        // waiting 3 values
        ['success', 'fetching'],
        ['success', 'fetching'],
        ['success', 'fetching'],
        // done iterating
        ['success', 'idle'],
      ]);
      expect(states).toMatchSnapshot();
    });

    test('useSuspenseQuery', async () => {
      await using ctx = testContext(keyPrefix);

      const { useTRPC } = ctx;
      function MyComponent() {
        const trpc = useTRPC();
        const { data } = useSuspenseQuery(
          trpc.post.byId.queryOptions({ id: '1' }),
        );

        expectTypeOf(data).toMatchTypeOf<'__result'>();

        return <pre>{JSON.stringify(data ?? 'n/a', null, 4)}</pre>;
      }

      const utils = ctx.renderApp(<MyComponent />);
      await vi.waitFor(() => {
        expect(utils.container).toHaveTextContent(`__result`);
      });
    });

    test('does not fetch if called from router directly', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await using ctx = testContext(keyPrefix);

      const post = await ctx.queryClient.fetchQuery(
        ctx.optionsProxyServer.post.byId.queryOptions({ id: '1' }),
      );

      expect(post).toEqual('__result');

      expect(fetchSpy).toHaveBeenCalledTimes(0);
    });

    // regression test for https://github.com/trpc/trpc/issues/6792
    test('initialData inference', async () => {
      await using ctx = testContext(keyPrefix);

      const { useTRPC } = ctx;
      function MyComponent() {
        const trpc = useTRPC();
        const queryOptions = trpc.post.list.queryOptions(undefined, {
          initialData: [],
        });
        expect(queryOptions.trpc.path).toBe('post.list');
        const query1 = useQuery(queryOptions);

        expectTypeOf(query1.data).toEqualTypeOf<Post[]>();

        return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
      }

      const utils = ctx.renderApp(<MyComponent />);
      await vi.waitFor(() => {
        expect(utils.container).toHaveTextContent('Hello world');
      });
    });

    test('initialData inference + select', async () => {
      await using ctx = testContext(keyPrefix);
      const noPostSymbol = Symbol('noPost');

      const { useTRPC } = ctx;
      function MyComponent() {
        const trpc = useTRPC();
        const queryOptions = trpc.post.list.queryOptions(undefined, {
          initialData: [],
          select: (data) => data[0] ?? noPostSymbol,
        });
        expect(queryOptions.trpc.path).toBe('post.list');
        const query1 = useQuery(queryOptions);

        expectTypeOf(query1.data).toEqualTypeOf<Post | typeof noPostSymbol>();

        return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
      }

      const utils = ctx.renderApp(<MyComponent />);
      await vi.waitFor(() => {
        expect(utils.container).toHaveTextContent('Hello world');
      });
    });
  },
);
