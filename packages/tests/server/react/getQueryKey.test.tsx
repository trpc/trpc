import { getServerAndReactClient } from './__reactHelpers';
import { useIsFetching } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { getQueryKey } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn/dist-cjs';
import React from 'react';
import { z } from 'zod';

type Post = {
  id: number;
  text: string;
};

const defaultPost = { id: 0, text: 'new post' };
const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const posts: Post[] = [defaultPost];

    const appRouter = t.router({
      post: t.router({
        byId: t.procedure
          .input(
            z.object({
              id: z.number(),
            }),
          )
          .query(({ input }) => posts.find((post) => post.id === input.id)),
        all: t.procedure.query(() => posts),
        list: t.procedure
          .input(z.object({ cursor: z.number() }))
          .query(({ input }) => {
            return posts.slice(input.cursor);
          }),
        moreLists: t.procedure
          .input(z.object({ anotherKey: z.number(), cursor: z.number() }))
          .query(({ input }) => {
            return posts.slice(input.cursor);
          }),
        update: t.procedure
          .input(
            z.object({
              name: z.string(),
            }),
          )
          .mutation(({ input }) => {
            return {
              user: {
                name: input.name,
              },
            };
          }),
      }),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

describe('getQueryKeys', () => {
  test('no input', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      const happy1 = getQueryKey(proxy.post.all, undefined, 'query');
      const happy2 = getQueryKey(proxy.post.all);

      // @ts-expect-error - post.all has no input
      const sad = getQueryKey(proxy.post.all, 'foo');

      return (
        <>
          <pre data-testid="qKey1">{JSON.stringify(happy1)}</pre>
          <pre data-testid="qKey2">{JSON.stringify(happy2)}</pre>
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('qKey1')).toHaveTextContent(
        JSON.stringify([['post', 'all'], { type: 'query' }]),
      );
      expect(utils.getByTestId('qKey2')).toHaveTextContent(
        JSON.stringify([['post', 'all']]),
      );
    });
  });

  test('with input', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      const happy1 = getQueryKey(proxy.post.byId, { id: 1 }, 'query');
      // input is fuzzy matched so should not be required
      const happy2 = getQueryKey(proxy.post.byId, undefined, 'query');
      const happy3 = getQueryKey(proxy.post.byId);

      // doesn't really make sense but should still work
      const happyIsh = getQueryKey(proxy.post.byId, { id: 1 });

      return (
        <>
          <pre data-testid="qKey1">{JSON.stringify(happy1)}</pre>
          <pre data-testid="qKey2">{JSON.stringify(happy2)}</pre>
          <pre data-testid="qKey3">{JSON.stringify(happy3)}</pre>
          <pre data-testid="qKey4">{JSON.stringify(happyIsh)}</pre>
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('qKey1')).toHaveTextContent(
        JSON.stringify([['post', 'byId'], { input: { id: 1 }, type: 'query' }]),
      );
      expect(utils.getByTestId('qKey2')).toHaveTextContent(
        JSON.stringify([['post', 'byId'], { type: 'query' }]),
      );
      expect(utils.getByTestId('qKey3')).toHaveTextContent(
        JSON.stringify([['post', 'byId']]),
      );
      expect(utils.getByTestId('qKey4')).toHaveTextContent(
        JSON.stringify([['post', 'byId'], { input: { id: 1 } }]),
      );
    });
  });

  test('undefined input but type', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      const happy = getQueryKey(proxy.post.list, undefined, 'infinite');

      // @ts-expect-error - cursor is not a valid input
      const sad = getQueryKey(proxy.post.list, { cursor: 1 }, 'infinite');

      return (
        <>
          <pre data-testid="qKey">{JSON.stringify(happy)}</pre>
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('qKey')).toHaveTextContent(
        JSON.stringify([['post', 'list'], { type: 'infinite' }]),
      );
    });
  });

  test('undefined input but type', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      const happy = getQueryKey(proxy.post.list, undefined, 'infinite');

      // @ts-expect-error - cursor is not a valid input
      const sad = getQueryKey(proxy.post.list, { cursor: 1 }, 'infinite');

      // @ts-expect-error - input is always invalid
      const sad2 = getQueryKey(proxy.post.list, { anyKey: 1 }, 'infinite');

      return (
        <>
          <pre data-testid="qKey">{JSON.stringify(happy)}</pre>
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('qKey')).toHaveTextContent(
        JSON.stringify([['post', 'list'], { type: 'infinite' }]),
      );
    });
  });

  test('extra key in input but type', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      const happy = getQueryKey(
        proxy.post.moreLists,
        { anotherKey: 1 },
        'infinite',
      );

      // these should also be valid since the input is fuzzy matched
      getQueryKey(proxy.post.moreLists, undefined, 'infinite');
      getQueryKey(proxy.post.moreLists, undefined);
      getQueryKey(proxy.post.moreLists);
      getQueryKey(proxy.post.moreLists, {}, 'infinite');
      getQueryKey(proxy.post.moreLists, { anotherKey: 1 });

      // @ts-expect-error - cursor is not a valid input
      const sad2 = getQueryKey(proxy.post.moreLists, { cursor: 1 }, 'infinite');

      // @ts-expect-error - input is always invalid
      const sad3 = getQueryKey(proxy.post.moreLists, { anyKey: 1 }, 'infinite');

      return (
        <>
          <pre data-testid="qKey">{JSON.stringify(happy)}</pre>
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('qKey')).toHaveTextContent(
        JSON.stringify([
          ['post', 'moreLists'],
          { input: { anotherKey: 1 }, type: 'infinite' },
        ]),
      );
    });
  });

  test('infinite', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      const happy = getQueryKey(proxy.post.list, undefined, 'infinite');

      return (
        <>
          <pre data-testid="qKey">{JSON.stringify(happy)}</pre>
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('qKey')).toHaveTextContent(
        JSON.stringify([['post', 'list'], { type: 'infinite' }]),
      );
    });
  });

  test('mutation', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      const happy = getQueryKey(proxy.post.update);

      // @ts-expect-error - mutations takes no input
      const sad = getQueryKey(proxy.post.update, { name: 'trash' });

      return (
        <div>
          <pre data-testid="qKey">{JSON.stringify(happy)}</pre>
        </div>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('qKey')).toHaveTextContent(
        JSON.stringify([['post', 'update']]),
      );
    });
  });

  test('on router', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      const happy = getQueryKey(proxy.post);

      // @ts-expect-error - router has no input
      const sad = getQueryKey(proxy.post, 'foo');

      return (
        <div>
          <pre data-testid="qKey">{JSON.stringify(happy)}</pre>
        </div>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('qKey')).toHaveTextContent(
        JSON.stringify([['post']]),
      );
    });
  });

  test('forwarded to a real method', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      proxy.post.all.useQuery();

      const qKey = getQueryKey(proxy.post.all, undefined, 'query');
      const isFetching = useIsFetching(qKey);

      return <div>{isFetching}</div>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    // should be fetching initially, and then not
    expect(utils.container).toHaveTextContent('1');
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('0');
    });
  });

  test('outside of the react context', () => {
    const { proxy } = ctx;

    const all = getQueryKey(proxy.post.all, undefined, 'query');
    const byId = getQueryKey(proxy.post.byId, { id: 1 }, 'query');

    expect(all).toEqual([['post', 'all'], { type: 'query' }]);
    expect(byId).toEqual([
      ['post', 'byId'],
      { input: { id: 1 }, type: 'query' },
    ]);
  });
});

describe('getQueryKeys deprecated', () => {
  test('no input', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      const happy1 = proxy.post.all.getQueryKey(undefined, 'query');
      const happy2 = proxy.post.all.getQueryKey();

      // @ts-expect-error - post.all has no input
      const sad = proxy.post.all.getQueryKey('foo');

      return (
        <>
          <pre data-testid="qKey1">{JSON.stringify(happy1)}</pre>
          <pre data-testid="qKey2">{JSON.stringify(happy2)}</pre>
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('qKey1')).toHaveTextContent(
        JSON.stringify([['post', 'all'], { type: 'query' }]),
      );
      expect(utils.getByTestId('qKey2')).toHaveTextContent(
        JSON.stringify([['post', 'all']]),
      );
    });
  });

  test('with input', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      const happy1 = proxy.post.byId.getQueryKey({ id: 1 }, 'query');

      // doesn't really make sense but should still work
      const happyIsh = proxy.post.byId.getQueryKey({ id: 1 });

      // @ts-expect-error - post.byId has required input
      const sad = proxy.post.byId.getQueryKey(undefined, 'query');

      return (
        <>
          <pre data-testid="qKey1">{JSON.stringify(happy1)}</pre>
          <pre data-testid="qKey2">{JSON.stringify(happyIsh)}</pre>
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('qKey1')).toHaveTextContent(
        JSON.stringify([['post', 'byId'], { input: { id: 1 }, type: 'query' }]),
      );
      expect(utils.getByTestId('qKey2')).toHaveTextContent(
        JSON.stringify([['post', 'byId'], { input: { id: 1 } }]),
      );
    });
  });

  test('on router', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      const happy = proxy.post.getQueryKey();

      // @ts-expect-error - router has no input
      const sad = proxy.post.getQueryKey('foo');

      return (
        <div>
          <pre data-testid="qKey">{JSON.stringify(happy)}</pre>
        </div>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('qKey')).toHaveTextContent(
        JSON.stringify([['post']]),
      );
    });
  });

  test('forwarded to a real method', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      proxy.post.all.useQuery();

      const qKey = proxy.post.all.getQueryKey(undefined, 'query');
      const isFetching = useIsFetching(qKey);

      return <div>{isFetching}</div>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    // should be fetching initially, and then not
    expect(utils.container).toHaveTextContent('1');
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('0');
    });
  });

  test('outside of the react context', () => {
    const { proxy } = ctx;

    const all = proxy.post.all.getQueryKey(undefined, 'query');
    const byId = proxy.post.byId.getQueryKey({ id: 1 }, 'query');

    expect(all).toEqual([['post', 'all'], { type: 'query' }]);
    expect(byId).toEqual([
      ['post', 'byId'],
      { input: { id: 1 }, type: 'query' },
    ]);
  });
});
