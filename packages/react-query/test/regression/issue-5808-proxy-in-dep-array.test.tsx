import { getServerAndReactClient } from '../__reactHelpers';
import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { createHydrationHelpers } from '@trpc/react-query/rsc';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import * as React from 'react';
import { z } from 'zod';

describe('original regression', () => {
  const ctx = konn()
    .beforeEach(() => {
      const { router, procedure } = initTRPC.create();

      const appRouter = router({
        deeply: {
          nested: {
            greeting: procedure.query(() => 'hello'),
            echo: procedure.input(z.string()).query((opts) => opts.input),
          },
        },
      });

      return getServerAndReactClient(appRouter);
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('utils proxy in dependency array', async () => {
    const { client, App } = ctx;
    const nonce = '_______________nonce_______________';
    let effectCount = 0;

    function MyComponent() {
      const result = client.deeply.nested.greeting.useQuery(undefined);
      const utils = client.useUtils();

      React.useEffect(() => {
        utils.deeply.nested.greeting.setData(undefined, nonce);
        effectCount++;
      }, [utils.deeply.nested.greeting]);

      return <pre>{result.data}</pre>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.container).toHaveTextContent(nonce);
    });
    expect(effectCount).toBe(1);
  });

  test('call twice', async () => {
    const client = ctx.opts.client;

    const nested = client.deeply.nested;
    expect(await nested.echo.query('hello')).toBe('hello');
    expect(await nested.echo.query('world')).toBe('world');
  });
});

describe('RSC regression', () => {
  const ctx = konn()
    .beforeEach(() => {
      // mock of React.cache deduplication
      const cache = <T extends (...args: any[]) => any>(fn: T) => {
        const cache = new Map<string, ReturnType<T>>();
        return (...args: Parameters<T>) => {
          const key = JSON.stringify(args);
          if (cache.has(key)) {
            return cache.get(key);
          }
          const result = fn(...args);
          cache.set(key, result);
          return result;
        };
      };

      const t = initTRPC.create();
      const postByIdInvokations = vi.fn();
      const appRouter = t.router({
        post: t.router({
          byId: t.procedure
            .input(
              z.object({
                id: z.string(),
              }),
            )
            .query((opts) => {
              postByIdInvokations({
                input: opts.input,
              });

              return `__result${opts.input.id}` as const;
            }),
        }),
      });

      const ctx = getServerAndReactClient(appRouter);

      const serverQueryClient = new QueryClient({
        defaultOptions: {
          queries: {
            // Since queries are prefetched on the server, we set a stale time so that
            // queries aren't immediately refetched on the client
            staleTime: 1000 * 30,
          },
          dehydrate: {
            // include pending queries in dehydration
            shouldDehydrateQuery: (query) =>
              defaultShouldDehydrateQuery(query) ||
              query.state.status === 'pending',
          },
        },
      });

      const createTRPCContext = cache(() => ({}));
      const getQueryClient = cache(() => serverQueryClient);
      const serverClient = t.createCallerFactory(appRouter)(createTRPCContext);

      const { trpc, HydrateClient } = createHydrationHelpers<typeof appRouter>(
        serverClient,
        getQueryClient,
      );

      return {
        ...ctx,
        trpc,
        HydrateClient,
        getQueryClient,
        postByIdInvokations,
      };
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('rsc prefetch helpers', async () => {
    const { client, App, trpc, HydrateClient, getQueryClient } = ctx;

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    function MyComponent() {
      const q1 = client.post.byId.useQuery({
        id: '1',
      });

      const q2 = client.post.byId.useQuery({
        id: '2',
      });

      return (
        <>
          {q1.data}
          {q2.data}
        </>
      );
    }

    // Imaginary RSC prefetch parent component
    function Parent() {
      void trpc.post.byId.prefetch({ id: '1' });
      void trpc.post.byId.prefetch({ id: '2' });
      return (
        <HydrateClient>
          <MyComponent />
        </HydrateClient>
      );
    }

    const utils1 = render(
      <App>
        <Parent />
      </App>,
    );
    await waitFor(() => {
      expect(utils1.container).toHaveTextContent('__result1');
      expect(utils1.container).toHaveTextContent('__result2');
    });
    expect(ctx.postByIdInvokations).toHaveBeenCalledTimes(2);

    // Should not have fetched from CC but taken promise from server client
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });
});
