import { getServerAndReactClient } from './__reactHelpers';
import { useIsFetching } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
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
    const t = initTRPC.create({
      errorFormatter({ shape }) {
        return {
          ...shape,
          data: {
            ...shape.data,
            foo: 'bar' as const,
          },
        };
      },
    });

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
          .input(
            z.object({
              cursor: z.string().optional(),
            }),
          )
          .query(() => posts),
        create: t.procedure
          .input(
            z.object({
              text: z.string(),
            }),
          )
          .mutation(({ input }) => {
            const newPost: Post = { id: posts.length, text: input.text };
            posts.push(newPost);
            return newPost;
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
      const happy = proxy.post.all.getQueryKey(undefined, 'query');

      // @ts-expect-error - post.all has no input
      const sad1 = proxy.post.all.getQueryKey('foo');
      // @ts-expect-error - need to specify type
      const sad2 = proxy.post.all.getQueryKey(undefined);

      return <pre data-testid="qKey">{JSON.stringify(happy)}</pre>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('qKey')).toHaveTextContent(
        JSON.stringify([['post', 'all'], { type: 'query' }]),
      );
    });
  });

  test('with input', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      const happy = proxy.post.byId.getQueryKey({ id: 1 }, 'query');

      // @ts-expect-error - post.byId has required input
      const sad1 = proxy.post.byId.getQueryKey(undefined, 'query');
      // @ts-expect-error - need to specify type
      const sad2 = proxy.post.byId.getQueryKey({ id: 1 });

      return <pre data-testid="qKey">{JSON.stringify(happy)}</pre>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('qKey')).toHaveTextContent(
        JSON.stringify([['post', 'byId'], { input: { id: 1 }, type: 'query' }]),
      );
    });
  });

  test('on router', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      const happy = proxy.post.getQueryKey(undefined, 'any');

      // @ts-expect-error - router has no input
      const sad = proxy.post.getQueryKey('foo', 'any');

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
        JSON.stringify([['post'], {}]),
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
});
