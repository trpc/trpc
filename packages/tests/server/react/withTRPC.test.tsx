/* eslint-disable @typescript-eslint/ban-ts-comment */
import { createAppRouter } from './__testHelpers';
import { DehydratedState } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { withTRPC } from '@trpc/next/src';
import { konn } from 'konn';
import { AppType } from 'next/dist/shared/lib/utils';
import React from 'react';

const ctx = konn()
  .beforeEach(() => createAppRouter())
  .afterEach((ctx) => ctx?.close?.())
  .done();

describe('withTRPC()', () => {
  test('useQuery', async () => {
    // @ts-ignore
    const { window } = global;

    // @ts-ignore
    delete global.window;
    const { trpc, trpcClientOptions } = ctx;
    const App: AppType = () => {
      const query = trpc.allPosts.useQuery();
      return <>{JSON.stringify(query.data)}</>;
    };

    const Wrapped = withTRPC({
      config: () => trpcClientOptions,
      ssr: true,
    })(App);

    const props = await Wrapped.getInitialProps!({
      AppTree: Wrapped,
      Component: <div />,
    } as any);

    // @ts-ignore
    global.window = window;

    const utils = render(<Wrapped {...props} />);
    expect(utils.container).toHaveTextContent('first post');
  });

  test('useQueries', async () => {
    // @ts-ignore
    const { window } = global;

    // @ts-ignore
    delete global.window;
    const { trpc, trpcClientOptions } = ctx;
    const App: AppType = () => {
      const results = trpc.useQueries((t) => {
        return [t.allPosts()];
      });

      return <>{JSON.stringify(results[0].data)}</>;
    };

    const Wrapped = withTRPC({
      config: () => trpcClientOptions,
      ssr: true,
    })(App);

    const props = await Wrapped.getInitialProps!({
      AppTree: Wrapped,
      Component: <div />,
    } as any);

    const propsTyped = props as {
      pageProps: {
        trpcState: DehydratedState;
      };
    };
    const allData = propsTyped.pageProps.trpcState.queries.map((v) => [
      v.queryKey,
      v.state.data,
    ]);
    expect(allData).toHaveLength(1);
    expect(allData).toMatchInlineSnapshot(`
      Array [
        Array [
          Array [
            Array [
              "allPosts",
            ],
            Object {
              "type": "query",
            },
          ],
          Array [
            Object {
              "createdAt": 0,
              "id": "1",
              "title": "first post",
            },
            Object {
              "createdAt": 1,
              "id": "2",
              "title": "second post",
            },
          ],
        ],
      ]
    `);

    // @ts-ignore
    global.window = window;

    const utils = render(<Wrapped {...props} />);
    expect(utils.container).toHaveTextContent('first post');
  });

  test('useInfiniteQuery', async () => {
    const { window } = global;

    // @ts-ignore
    delete global.window;
    const { trpc, trpcClientOptions } = ctx;
    const App: AppType = () => {
      const query = trpc.paginatedPosts.useInfiniteQuery(
        {
          limit: 10,
        },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
      );
      return <>{JSON.stringify(query.data || query.error)}</>;
    };

    const Wrapped = withTRPC({
      config: () => trpcClientOptions,
      ssr: true,
    })(App);

    const props = await Wrapped.getInitialProps!({
      AppTree: Wrapped,
      Component: <div />,
    } as any);

    global.window = window;

    const utils = render(<Wrapped {...props} />);
    expect(utils.container).toHaveTextContent('first post');
  });

  test('browser render', async () => {
    const { trpc, trpcClientOptions } = ctx;
    const App: AppType = () => {
      const query = trpc.allPosts.useQuery();
      return <>{JSON.stringify(query.data)}</>;
    };

    const Wrapped = withTRPC({
      config: () => trpcClientOptions,
      ssr: true,
    })(App);

    const props = await Wrapped.getInitialProps!({
      AppTree: Wrapped,
      Component: <div />,
    } as any);

    const utils = render(<Wrapped {...props} />);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
    });
  });

  describe('`ssr: false` on query', () => {
    test('useQuery()', async () => {
      const { window } = global;

      // @ts-ignore
      delete global.window;
      const { trpc, trpcClientOptions } = ctx;
      const App: AppType = () => {
        const query = trpc.allPosts.useQuery(undefined, {
          trpc: { ssr: false },
        });
        return <>{JSON.stringify(query.data)}</>;
      };

      const Wrapped = withTRPC({
        config: () => trpcClientOptions,
        ssr: true,
      })(App);

      const props = await Wrapped.getInitialProps!({
        AppTree: Wrapped,
        Component: <div />,
      } as any);

      global.window = window;

      const utils = render(<Wrapped {...props} />);
      expect(utils.container).not.toHaveTextContent('first post');

      // should eventually be fetched
      await waitFor(() => {
        expect(utils.container).toHaveTextContent('first post');
      });
    });

    test('useInfiniteQuery', async () => {
      const { window } = global;

      // @ts-ignore
      delete global.window;
      const { trpc, trpcClientOptions } = ctx;
      const App: AppType = () => {
        const query = trpc.paginatedPosts.useInfiniteQuery(
          {
            limit: 10,
          },
          {
            getNextPageParam: (lastPage) => lastPage.nextCursor,
            trpc: {
              ssr: false,
            },
          },
        );
        return <>{JSON.stringify(query.data || query.error)}</>;
      };

      const Wrapped = withTRPC({
        config: () => trpcClientOptions,
        ssr: true,
      })(App);

      const props = await Wrapped.getInitialProps!({
        AppTree: Wrapped,
        Component: <div />,
      } as any);

      global.window = window;

      const utils = render(<Wrapped {...props} />);
      expect(utils.container).not.toHaveTextContent('first post');

      // should eventually be fetched
      await waitFor(() => {
        expect(utils.container).toHaveTextContent('first post');
      });
    });
  });

  test('useQuery - ssr batching', async () => {
    // @ts-ignore
    const { window } = global;

    // @ts-ignore
    delete global.window;
    const { trpc, trpcClientOptions, createContext } = ctx;
    const App: AppType = () => {
      const query1 = trpc.postById.useQuery('1');
      const query2 = trpc.postById.useQuery('2');

      return <>{JSON.stringify([query1.data, query2.data])}</>;
    };

    const Wrapped = withTRPC({
      config: () => trpcClientOptions,
      ssr: true,
    })(App);

    const props = await Wrapped.getInitialProps!({
      AppTree: Wrapped,
      Component: <div />,
    } as any);

    // @ts-ignore
    global.window = window;

    const utils = render(<Wrapped {...props} />);
    expect(utils.container).toHaveTextContent('first post');
    expect(utils.container).toHaveTextContent('second post');

    // confirm we've batched if createContext has only been called once
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  describe('`enabled: false` on query during ssr', () => {
    describe('useQuery', () => {
      test('queryKey does not change', async () => {
        const { window } = global;

        // @ts-ignore
        delete global.window;
        const { trpc, trpcClientOptions } = ctx;
        const App: AppType = () => {
          const query1 = trpc.postById.useQuery('1');
          // query2 depends only on query1 status
          const query2 = trpc.postById.useQuery('2', {
            enabled: query1.status === 'success',
          });
          return (
            <>
              <>{JSON.stringify(query1.data)}</>
              <>{JSON.stringify(query2.data)}</>
            </>
          );
        };

        const Wrapped = withTRPC({
          config: () => trpcClientOptions,
          ssr: true,
        })(App);

        const props = await Wrapped.getInitialProps!({
          AppTree: Wrapped,
          Component: <div />,
        } as any);

        global.window = window;

        const utils = render(<Wrapped {...props} />);

        // when queryKey does not change query2 only fetched in the browser
        expect(utils.container).toHaveTextContent('first post');
        expect(utils.container).not.toHaveTextContent('second post');

        await waitFor(() => {
          expect(utils.container).toHaveTextContent('first post');
          expect(utils.container).toHaveTextContent('second post');
        });
      });

      test('queryKey changes', async () => {
        const { window } = global;

        // @ts-ignore
        delete global.window;
        const { trpc, trpcClientOptions } = ctx;
        const App: AppType = () => {
          const query1 = trpc.postById.useQuery('1');
          // query2 depends on data fetched by query1
          const query2 = trpc.postById.useQuery(
            // workaround of TS requiring a string param
            query1.data
              ? (parseInt(query1.data.id) + 1).toString()
              : 'definitely not a post id',
            {
              enabled: !!query1.data,
            },
          );
          return (
            <>
              <>{JSON.stringify(query1.data)}</>
              <>{JSON.stringify(query2.data)}</>
            </>
          );
        };

        const Wrapped = withTRPC({
          config: () => trpcClientOptions,
          ssr: true,
        })(App);

        const props = await Wrapped.getInitialProps!({
          AppTree: Wrapped,
          Component: <div />,
        } as any);

        global.window = window;

        const utils = render(<Wrapped {...props} />);

        // when queryKey changes both queries are fetched on the server
        expect(utils.container).toHaveTextContent('first post');
        expect(utils.container).toHaveTextContent('second post');

        await waitFor(() => {
          expect(utils.container).toHaveTextContent('first post');
          expect(utils.container).toHaveTextContent('second post');
        });
      });
    });

    describe('useInfiniteQuery', () => {
      test('queryKey does not change', async () => {
        const { window } = global;

        // @ts-ignore
        delete global.window;
        const { trpc, trpcClientOptions } = ctx;
        const App: AppType = () => {
          const query1 = trpc.paginatedPosts.useInfiniteQuery(
            { limit: 1 },
            {
              getNextPageParam: (lastPage) => lastPage.nextCursor,
            },
          );
          // query2 depends only on query1 status
          const query2 = trpc.paginatedPosts.useInfiniteQuery(
            { limit: 2 },
            {
              getNextPageParam: (lastPage) => lastPage.nextCursor,
              enabled: query1.status === 'success',
            },
          );
          return (
            <>
              <>{JSON.stringify(query1.data)}</>
              <>{JSON.stringify(query2.data)}</>
            </>
          );
        };

        const Wrapped = withTRPC({
          config: () => trpcClientOptions,
          ssr: true,
        })(App);

        const props = await Wrapped.getInitialProps!({
          AppTree: Wrapped,
          Component: <div />,
        } as any);

        global.window = window;

        const utils = render(<Wrapped {...props} />);

        // when queryKey does not change query2 only fetched in the browser
        expect(utils.container).toHaveTextContent('first post');
        expect(utils.container).not.toHaveTextContent('second post');

        await waitFor(() => {
          expect(utils.container).toHaveTextContent('first post');
          expect(utils.container).toHaveTextContent('second post');
        });
      });

      test('queryKey changes', async () => {
        const { window } = global;

        // @ts-ignore
        delete global.window;
        const { trpc, trpcClientOptions } = ctx;
        const App: AppType = () => {
          const query1 = trpc.paginatedPosts.useInfiniteQuery(
            { limit: 1 },
            {
              getNextPageParam: (lastPage) => lastPage.nextCursor,
            },
          );
          // query2 depends on data fetched by query1
          const query2 = trpc.paginatedPosts.useInfiniteQuery(
            { limit: query1.data ? query1.data.pageParams.length + 1 : 0 },
            {
              getNextPageParam: (lastPage) => lastPage.nextCursor,
              enabled: query1.status === 'success',
            },
          );
          return (
            <>
              <>{JSON.stringify(query1.data)}</>
              <>{JSON.stringify(query2.data)}</>
            </>
          );
        };

        const Wrapped = withTRPC({
          config: () => trpcClientOptions,
          ssr: true,
        })(App);

        const props = await Wrapped.getInitialProps!({
          AppTree: Wrapped,
          Component: <div />,
        } as any);

        global.window = window;

        const utils = render(<Wrapped {...props} />);

        // when queryKey changes both queries are fetched on the server
        expect(utils.container).toHaveTextContent('first post');
        expect(utils.container).toHaveTextContent('second post');

        await waitFor(() => {
          expect(utils.container).toHaveTextContent('first post');
          expect(utils.container).toHaveTextContent('second post');
        });
      });
    });
  });

  describe('individual pages', () => {
    test('useQuery', async () => {
      // @ts-ignore
      const { window } = global;

      // @ts-ignore
      delete global.window;
      const { trpc, trpcClientOptions } = ctx;
      const App = () => {
        const query = trpc.allPosts.useQuery();
        return <>{JSON.stringify(query.data)}</>;
      };

      const Wrapped = withTRPC({
        config: () => trpcClientOptions,
      })(App);

      // @ts-ignore
      global.window = window;

      const utils = render(<Wrapped />);
      expect(utils.container).not.toHaveTextContent('first post');

      // should eventually be fetched
      await waitFor(() => {
        expect(utils.container).toHaveTextContent('first post');
      });
    });
    test('useQuery - ssr', async () => {
      // @ts-ignore
      const { window } = global;

      // @ts-ignore
      delete global.window;
      const { trpc, trpcClientOptions } = ctx;
      const App = () => {
        const query = trpc.allPosts.useQuery();
        return <>{JSON.stringify(query.data)}</>;
      };

      const Wrapped = withTRPC({
        config: () => trpcClientOptions,
        ssr: true,
      })(App);

      // @ts-ignore
      global.window = window;

      // ssr should not work

      const utils = render(<Wrapped />);
      expect(utils.container).not.toHaveTextContent('first post');

      // should eventually be fetched
      await waitFor(() => {
        expect(utils.container).toHaveTextContent('first post');
      });
    });
  });
});
