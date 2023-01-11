import { getServerAndReactClient } from './__reactHelpers';
import {
  useIsFetching,
  useIsMutating,
  useQueryClient,
} from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn/dist-cjs';
import React, { useEffect } from 'react';
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
        create: t.procedure.mutation(() => 'new post'),
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

describe('mutation keys', () => {
  test('can grab from cache using correct key', async () => {
    const { proxy, App } = ctx;

    function MyComponent() {
      const postCreate = proxy.post.create.useMutation();

      const mutationKey = [['post', 'create']]; // TODO: Maybe add a getter later?
      const isMutating = useIsMutating({ mutationKey });

      const queryClient = useQueryClient();
      const mutationCache = queryClient.getMutationCache();

      useEffect(() => {
        postCreate.mutate();
        const mutation = mutationCache.find({ mutationKey });
        expect(mutation).not.toBeUndefined();
      }, []);

      return (
        <div>
          <button onClick={() => postCreate.mutate()} data-testid="mutate" />
          <pre data-testid="status">{isMutating}</pre>
        </div>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    // should not be mutating
    expect(utils.getByTestId('status')).toHaveTextContent('0');

    // should be mutating after button press
    userEvent.click(utils.getByTestId('mutate'));
    await waitFor(() => {
      expect(utils.getByTestId('status')).toHaveTextContent('1');
    });
  });
});
