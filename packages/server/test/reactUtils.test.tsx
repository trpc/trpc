import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { konn } from 'konn';
import { useEffect } from 'react';
import React from 'react';
import { z } from 'zod';
import { initTRPC } from '../src/core';

type Post = {
  id: number;
  text: string;
};

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC()({
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

    const posts: Post[] = [];

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
          .query(() => '__infResult' as const),
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

test('invalidate', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const allPosts = proxy.post.all.useQuery();
    const createPostMutation = proxy.post.create.useMutation();

    const utils = proxy.useContext();

    useEffect(() => {
      createPostMutation.mutate(
        { text: 'invalidate' },
        {
          onSuccess() {
            utils.post.all.invalidate();

            // @ts-expect-error Should not exist
            utils.post.create.invalidate;
          },
        },
      );
    }, [createPostMutation, utils]);

    if (!allPosts.data) {
      return <>...</>;
    }
    console.log(allPosts.data);
    return (
      <>
        {allPosts.data.map((post) => {
          console.log(post);
          return <div key={post.id}>{post.text}</div>;
        })}
      </>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('invalidate');
  });
});

test('setData', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const allPosts = proxy.post.all.useQuery(undefined, { enabled: false });

    const utils = proxy.useContext();

    useEffect(() => {
      utils.post.all.setData([{ id: 0, text: 'setData' }]);
    }, [utils]);

    if (!allPosts.data) {
      return <>...</>;
    }

    return <p>{allPosts.data[0]?.text}</p>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('setData');
  });
});
