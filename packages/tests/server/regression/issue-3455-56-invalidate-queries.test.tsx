import { getServerAndReactClient } from '../react/__reactHelpers';
import { useQuery } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server/src';
import { konn } from 'konn';
import React from 'react';
import { z } from 'zod';

const post = { id: 1, text: 'foo' };
const posts = [post];

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
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

      greeting: t.procedure.query(() => 'Hello trpc'),
    });
    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('invalidate with filter', async () => {
  const { proxy, App } = ctx;
  const greetingSpy = jest.fn();
  const postSpy = jest.fn();

  function MyComponent() {
    const allPosts = proxy.post.all.useQuery(undefined, {
      onSuccess: () => postSpy(),
    });
    const greeting = proxy.greeting.useQuery(undefined, {
      onSuccess: () => greetingSpy(),
    });

    const utils = proxy.useContext();

    return (
      <>
        <button
          data-testid="invalidate"
          onClick={() => {
            utils.invalidate(undefined, {
              predicate: (query) => {
                return (query.queryKey[0] as string[])[0] === 'post';
              },
            });
          }}
        />
        {allPosts.isFetching ? 'posts:fetching' : 'posts:done'}
        {allPosts.data?.map((post) => {
          return <div key={post.id}>{post.text}</div>;
        })}
        {greeting.isFetching ? 'greeting:fetching' : 'greeting:done'}
        {greeting.data}
      </>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent('posts:done');
    expect(utils.container).toHaveTextContent('greeting:done');
  });

  const invalidateButton = await utils.findByTestId('invalidate');
  await userEvent.click(invalidateButton);

  // post should match the filter and be invalidated
  // greeting should not and thus still be done
  expect(utils.container).toHaveTextContent('posts:fetching');
  expect(utils.container).toHaveTextContent('greeting:done');

  await waitFor(() => {
    expect(utils.container).toHaveTextContent('posts:done');
    expect(utils.container).toHaveTextContent('greeting:done');
  });

  expect(postSpy).toHaveBeenCalledTimes(2);
  expect(greetingSpy).toHaveBeenCalledTimes(1);
});

test('tanstack query queries are invalidated', async () => {
  const { proxy, App } = ctx;

  function MyComponent() {
    const utils = proxy.useContext();

    const rqQuery = useQuery(['test'], async () => 'Hello tanstack');
    const trpcQuery = proxy.greeting.useQuery();

    return (
      <>
        <button data-testid="invalidate" onClick={() => utils.invalidate()} />
        {rqQuery.isFetching ? 'rq:fetching' : 'rq:done'}
        {trpcQuery.isFetching ? 'trpc:fetching' : 'trpc:done'}
      </>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('rq:done');
    expect(utils.container).toHaveTextContent('trpc:done');
  });

  await userEvent.click(utils.getByTestId('invalidate'));

  expect(utils.container).toHaveTextContent('rq:fetching');
  expect(utils.container).toHaveTextContent('trpc:fetching');

  await waitFor(() => {
    expect(utils.container).toHaveTextContent('rq:done');
    expect(utils.container).toHaveTextContent('trpc:done');
  });
});
