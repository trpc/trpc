import { getServerAndReactClient } from './__reactHelpers';
import { useIsFetching } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { getQueryKey } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
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
    const { client, App } = ctx;

    function MyComponent() {
      const happy1 = getQueryKey(client.post.all, undefined, 'query');
      const happy2 = getQueryKey(client.post.all);

      // @ts-expect-error - post.all has no input
      const sad = getQueryKey(client.post.all, 'foo');

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
    const { client, App } = ctx;

    function MyComponent() {
      const happy1 = getQueryKey(client.post.byId, { id: 1 }, 'query');
      // input is fuzzy matched so should not be required
      const happy2 = getQueryKey(client.post.byId, undefined, 'query');
      const happy3 = getQueryKey(client.post.byId);

      // doesn't really make sense but should still work
      const happyIsh = getQueryKey(client.post.byId, { id: 1 });

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
    const { client, App } = ctx;

    function MyComponent() {
      const happy = getQueryKey(client.post.list, undefined, 'infinite');

      // @ts-expect-error - cursor is not a valid input
      const sad = getQueryKey(client.post.list, { cursor: 1 }, 'infinite');

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
    const { client, App } = ctx;

    function MyComponent() {
      const happy = getQueryKey(client.post.list, undefined, 'infinite');

      // @ts-expect-error - cursor is not a valid input
      const sad = getQueryKey(client.post.list, { cursor: 1 }, 'infinite');

      // @ts-expect-error - input is always invalid
      const sad2 = getQueryKey(client.post.list, { anyKey: 1 }, 'infinite');

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
    const { client, App } = ctx;

    function MyComponent() {
      const happy = getQueryKey(
        client.post.moreLists,
        { anotherKey: 1 },
        'infinite',
      );

      // these should also be valid since the input is fuzzy matched
      getQueryKey(client.post.moreLists, undefined, 'infinite');
      getQueryKey(client.post.moreLists, undefined);
      getQueryKey(client.post.moreLists);
      getQueryKey(client.post.moreLists, {}, 'infinite');
      getQueryKey(client.post.moreLists, { anotherKey: 1 });

      const sad2 = getQueryKey(
        client.post.moreLists,
        // @ts-expect-error - cursor is not a valid input
        { cursor: 1 },
        'infinite',
      );

      const sad3 = getQueryKey(
        client.post.moreLists,
        // @ts-expect-error - input is always invalid
        { anyKey: 1 },
        'infinite',
      );

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
    const { client, App } = ctx;

    function MyComponent() {
      const happy = getQueryKey(client.post.list, undefined, 'infinite');

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
    const { client, App } = ctx;

    function MyComponent() {
      const happy = getQueryKey(client.post.update);

      // @ts-expect-error - mutations takes no input
      const sad = getQueryKey(client.post.update, { name: 'trash' });

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
    const { client, App } = ctx;

    function MyComponent() {
      const happy = getQueryKey(client.post);

      // @ts-expect-error - router has no input
      const sad = getQueryKey(client.post, 'foo');

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
    const { client, App } = ctx;

    function MyComponent() {
      client.post.all.useQuery();

      const qKey = getQueryKey(client.post.all, undefined, 'query');
      const isFetching = useIsFetching({ queryKey: qKey });

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
    const { client } = ctx;

    const all = getQueryKey(client.post.all, undefined, 'query');
    const byId = getQueryKey(client.post.byId, { id: 1 }, 'query');

    expect(all).toEqual([['post', 'all'], { type: 'query' }]);
    expect(byId).toEqual([
      ['post', 'byId'],
      { input: { id: 1 }, type: 'query' },
    ]);
  });
});
