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

      // doesn't really make sense but should still work
      const happyIsh = getQueryKey(proxy.post.byId, { id: 1 });

      // @ts-expect-error - post.byId has required input
      const sad = getQueryKey(proxy.post.byId, undefined, 'query');

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
