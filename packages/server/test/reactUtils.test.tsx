import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { konn } from 'konn';
import { useEffect, useState } from 'react';
import React from 'react';
import { z } from 'zod';
import { initTRPC } from '../src/core';

type Post = {
  id: number;
  text: string;
};

const defaultPost = { id: 0, text: 'new post' };
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

test('fetch', async () => {
  const { proxy, App } = ctx;

  function MyComponent() {
    const utils = proxy.useContext();
    const [posts, setPosts] = useState<Post[]>([]);

    useEffect(() => {
      utils.post.all.fetch().then((allPosts) => setPosts(allPosts));
    }, [utils]);

    return <p>{posts[0]?.text}</p>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('new post');
  });
});

test('prefetch', async () => {
  const { proxy, App } = ctx;
  const renderProxy = jest.fn();

  function Posts() {
    const allPosts = proxy.post.all.useQuery();
    renderProxy(allPosts.data);
    return (
      <>
        {allPosts!.data!.map((post) => {
          return <div key={post.id}>{post.text}</div>;
        })}
      </>
    );
  }

  function MyComponent() {
    const utils = proxy.useContext();
    const [hasPrefetched, setHasPrefetched] = useState(false);
    useEffect(() => {
      utils.post.all.prefetch().then(() => {
        setHasPrefetched(true);
      });
    }, [utils]);

    return hasPrefetched ? <Posts /> : null;
  }

  render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(renderProxy).toHaveBeenNthCalledWith<[Post[]]>(1, [defaultPost]);
  });
});

test('invalidate', async () => {
  const { proxy, App } = ctx;
  const stableProxySpy = jest.fn();

  function MyComponent() {
    const allPosts = proxy.post.all.useQuery();
    const createPostMutation = proxy.post.create.useMutation();

    const utils = proxy.useContext();

    useEffect(() => {
      stableProxySpy(proxy);
    }, []);

    if (!allPosts.data) {
      return <>...</>;
    }
    return (
      <>
        <button
          data-testid="add-post"
          onClick={() => {
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
          }}
        />
        {allPosts.data.map((post) => {
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

  const addPostButton = await utils.findByTestId('add-post');

  await userEvent.click(addPostButton);
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('invalidate');
  });
  expect(stableProxySpy).toHaveBeenCalledTimes(1);
});

test('refetch', async () => {
  const { proxy, App } = ctx;
  const querySuccessSpy = jest.fn();

  function MyComponent() {
    const utils = proxy.useContext();
    const allPosts = proxy.post.all.useQuery(undefined, {
      onSuccess() {
        querySuccessSpy();
      },
    });

    useEffect(() => {
      if (allPosts.data) {
        utils.post.all.refetch();
      }
    }, [allPosts.data, utils]);

    return null;
  }

  render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(querySuccessSpy).toHaveBeenCalledTimes(2);
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

test('getData', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const allPosts = proxy.post.all.useQuery();
    const [posts, setPosts] = useState<Post[]>([]);
    const utils = proxy.useContext();

    useEffect(() => {
      if (allPosts.data) {
        const getDataPosts = utils.post.all.getData();
        if (getDataPosts) {
          setPosts(getDataPosts);
        }
      }
    }, [allPosts.data, utils]);

    if (!allPosts.data) {
      return <>...</>;
    }

    return (
      <>
        {posts.map((post) => {
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
    expect(utils.container).toHaveTextContent('new post');
  });
});
