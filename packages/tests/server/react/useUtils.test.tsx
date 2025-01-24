/* eslint-disable react-hooks/exhaustive-deps */
import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React, { useEffect, useState } from 'react';
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
              cursor: z.number().optional(),
            }),
          )
          .query((opts) => ({
            items: posts.slice(opts.input.cursor ?? 0),
            time: Date.now(), // make sure each request returns a different value
          })),
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

      greeting: t.router({
        get: t.procedure.query(() => 'hello'),
      }),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('client query', async () => {
  const { client, App } = ctx;

  function MyComponent() {
    const utils = client.useUtils();
    const [post, setPost] = useState<Post>();

    useEffect(() => {
      (async () => {
        const res = await utils.client.post.byId.query({ id: 0 });
        expectTypeOf<Post | undefined>(res);
        setPost(res);
      })();
    }, [utils]);

    return <p>{post?.text}</p>;
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

test('client query sad path', async () => {
  const { client, App } = ctx;

  function MyComponent() {
    const utils = client.useUtils();
    const [isError, setIsError] = useState(false);

    useEffect(() => {
      (async () => {
        try {
          // @ts-expect-error - byUser does not exist on postRouter
          await utils.client.post.byUser.query({ id: 0 });
        } catch (e) {
          setIsError(true);
        }
      })();
    }, []);

    return <p>{isError ? 'Query errored' : "Query didn't error"}</p>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('Query errored');
  });
});

test('client mutation', async () => {
  const { client, App } = ctx;

  function MyComponent() {
    const utils = client.useUtils();
    const { data: posts } = client.post.all.useQuery();
    const [newPost, setNewPost] = useState<Post>();

    useEffect(() => {
      (async () => {
        const newPost = await utils.client.post.create.mutate({
          text: 'another post',
        });
        expectTypeOf<Post | undefined>(newPost);
        setNewPost(newPost);
      })();
    }, []);

    return (
      <div>
        <p data-testid="initial-post">{posts?.[0]?.text}</p>
        <p data-testid="newpost">{newPost?.text}</p>
      </div>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.getByTestId('initial-post')).toHaveTextContent('new post');
    expect(utils.getByTestId('newpost')).toHaveTextContent('another post');
  });
});

test('fetch', async () => {
  const { client, App } = ctx;

  const context = {
    ___TEST___: true,
  };
  function MyComponent() {
    const utils = client.useUtils();
    const [posts, setPosts] = useState<Post[]>([]);

    useEffect(() => {
      utils.post.all
        .fetch(undefined, {
          trpc: {
            context,
          },
        })
        .then((allPosts) => {
          setPosts(allPosts);
        });
    }, []);

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

  expect(ctx.spyLink.mock.calls[0]![0].context).toMatchObject(context);
});

test('prefetch', async () => {
  const { client, App } = ctx;
  const renderclient = vi.fn();

  const context = {
    ___TEST___: true,
  };

  function Posts() {
    const allPosts = client.post.all.useQuery();
    renderclient(allPosts.data);
    return (
      <>
        {allPosts.data?.map((post) => {
          return <div key={post.id}>{post.text}</div>;
        })}
      </>
    );
  }

  function MyComponent() {
    const utils = client.useUtils();
    const [hasPrefetched, setHasPrefetched] = useState(false);
    useEffect(() => {
      utils.post.all
        .prefetch(undefined, {
          trpc: {
            context,
          },
        })
        .then(() => {
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
    expect(renderclient).toHaveBeenNthCalledWith<[Post[]]>(1, [defaultPost]);
  });

  expect(ctx.spyLink.mock.calls[0]![0].context).toMatchObject(context);
});

test('invalidate', async () => {
  const { client, App } = ctx;
  const stableclientSpy = vi.fn();

  function MyComponent() {
    const allPosts = client.post.all.useQuery();

    useEffect(() => {
      if (allPosts.data) stableclientSpy();
    }, [allPosts.data]);

    const createPostMutation = client.post.create.useMutation();

    const utils = client.useUtils();

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

                  // @ts-expect-error Should not exist
                  utils.post.all.setMutationDefaults;
                },
              },
            );
          }}
        />
        {allPosts.isFetching ? 'fetching' : 'done'}
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

  await waitFor(() => {
    expect(utils.container).toHaveTextContent('done');
  });

  expect(stableclientSpy).toHaveBeenCalledTimes(1);

  const addPostButton = await utils.findByTestId('add-post');

  await userEvent.click(addPostButton);
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('invalidate');
  });
  expect(stableclientSpy).toHaveBeenCalledTimes(2);
});

test('invalidate procedure for both query and infinite', async () => {
  const { client, App } = ctx;
  const invalidateQuerySpy = vi.fn();
  const invalidateInfiniteSpy = vi.fn();

  function MyComponent() {
    const allPostsList = client.post.list.useQuery({ cursor: undefined });
    const allPostsListInfinite = client.post.list.useInfiniteQuery(
      { cursor: undefined },
      {
        // We don't care about the cursor here
        getNextPageParam: () => undefined,
      },
    );

    useEffect(() => {
      if (allPostsList.data) invalidateQuerySpy();
    }, [allPostsList.data]);
    useEffect(() => {
      if (allPostsListInfinite.data) invalidateInfiniteSpy();
    }, [allPostsListInfinite.data]);

    const utils = client.useUtils();

    return (
      <>
        <button
          data-testid="invalidate-button"
          onClick={() => {
            utils.post.list.invalidate();
          }}
        />
        <div data-testid="list-status">
          {allPostsList.isFetching || allPostsListInfinite.isFetching
            ? 'fetching'
            : 'done'}
        </div>
        <div>
          {allPostsListInfinite.data?.pages.map((page) => {
            return page.items.map((post) => {
              return <div key={post.id}>{post.text}</div>;
            });
          })}
        </div>
      </>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent('done');
    expect(utils.container).toHaveTextContent('new post');
    expect(invalidateQuerySpy).toHaveBeenCalledTimes(1);
    expect(invalidateInfiniteSpy).toHaveBeenCalledTimes(1);
  });

  const invalidateButton = await utils.findByTestId('invalidate-button');

  await userEvent.click(invalidateButton);

  await waitFor(() => {
    expect(utils.container).toHaveTextContent('done');
    expect(invalidateQuerySpy).toHaveBeenCalledTimes(2);
    expect(invalidateInfiniteSpy).toHaveBeenCalledTimes(2);
  });
});

test('reset', async () => {
  const { client, App } = ctx;
  const stableclientSpy = vi.fn();

  function MyComponent() {
    const allPosts = client.post.all.useQuery();
    const createPostMutation = client.post.create.useMutation();

    const utils = client.useUtils();

    useEffect(() => {
      stableclientSpy(client);
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
              { text: 'reset' },
              {
                onSuccess() {
                  utils.post.all.reset();
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
    expect(utils.container).toHaveTextContent('reset');
  });
  expect(stableclientSpy).toHaveBeenCalledTimes(1);
});

test('refetch', async () => {
  const { client, App, spyLink } = ctx;
  spyLink.mockClear();

  function MyComponent() {
    const utils = client.useUtils();
    const allPosts = client.post.all.useQuery();

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
    expect(spyLink).toHaveBeenCalledTimes(2);
  });
});

test('setData', async () => {
  const { client, App } = ctx;
  function MyComponent() {
    const allPosts = client.post.all.useQuery(undefined, { enabled: false });

    const utils = client.useUtils();

    useEffect(() => {
      if (!allPosts.data) {
        utils.post.all.setData(undefined, [{ id: 0, text: 'setData1' }]);
      }

      if (allPosts.data) {
        utils.post.all.setData(undefined, (prev) => [
          ...(prev ?? []), //                ^?
          { id: 1, text: 'setData2' },
        ]);
      }
    }, [allPosts.data]);

    if (!allPosts.data) {
      return <>...</>;
    }

    return <>{JSON.stringify(allPosts.data, null, 4)}</>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('setData1');
    expect(utils.container).toHaveTextContent('setData2');

    expect(utils.container).toMatchInlineSnapshot(`
      <div>
        [
          {
              "id": 0,
              "text": "setData1"
          },
          {
              "id": 1,
              "text": "setData2"
          }
      ]
      </div>
    `);
  });
});

test('setInfiniteData', async () => {
  const { client, App } = ctx;
  function MyComponent() {
    const listPosts = client.post.list.useInfiniteQuery(
      {},
      {
        enabled: false,
        getNextPageParam: (lastPage, _allPages, lastPageParam) =>
          lastPage.items?.length === 0 ? undefined : (lastPageParam ?? 0) + 1,
      },
    );

    const utils = client.useUtils();

    useEffect(() => {
      if (!listPosts.data) {
        utils.post.list.setInfiniteData(
          {},
          {
            pageParams: [0],
            pages: [{ items: [{ id: 0, text: 'setInfiniteData1' }], time: 0 }],
          },
        );
      }

      if (listPosts.data) {
        utils.post.list.setInfiniteData({}, (prev) => {
          const data = prev ?? {
            pageParams: [],
            pages: [],
          };
          return {
            pageParams: [...data.pageParams, 1],
            pages: [
              ...data.pages,

              {
                items: [
                  {
                    id: 1,
                    text: 'setInfiniteData2',
                  },
                ],
                time: 1,
              },
            ],
          };
        });
      }
    }, [listPosts.data]);

    if (!listPosts.data) {
      return <>...</>;
    }

    return <>{JSON.stringify(listPosts.data, null, 4)}</>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('setInfiniteData1');
    expect(utils.container).toHaveTextContent('setInfiniteData2');
    expect(utils.container).toMatchInlineSnapshot(`
      <div>
        {
          "pageParams": [
              0,
              1
          ],
          "pages": [
              {
                  "items": [
                      {
                          "id": 0,
                          "text": "setInfiniteData1"
                      }
                  ],
                  "time": 0
              },
              {
                  "items": [
                      {
                          "id": 1,
                          "text": "setInfiniteData2"
                      }
                  ],
                  "time": 1
              }
          ]
      }
      </div>
    `);
  });
});

test('getData', async () => {
  const { client, App } = ctx;
  function MyComponent() {
    const allPosts = client.post.all.useQuery();
    const [posts, setPosts] = useState<Post[]>([]);
    const utils = client.useUtils();

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

describe('cancel', () => {
  test('aborts with utils', async () => {
    const { client, App } = ctx;
    function MyComponent() {
      const allPosts = client.post.all.useQuery();
      const utils = client.useUtils();

      useEffect(() => {
        utils.post.all.cancel();
      });

      return (
        <div>
          <p data-testid="data">
            {allPosts.data ? 'data loaded' : 'undefined'}
          </p>
          <p data-testid="isFetching">
            {allPosts.isFetching ? 'fetching' : 'idle'}
          </p>
          <p data-testid="isPaused">
            {allPosts.isPaused ? 'paused' : 'not paused'}
          </p>
        </div>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('data')).toHaveTextContent('undefined');
      expect(utils.getByTestId('isFetching')).toHaveTextContent('idle');
      expect(utils.getByTestId('isPaused')).toHaveTextContent('paused');
    });
  });

  test('abort query and infinite with utils', async () => {
    const { client, App } = ctx;
    function MyComponent() {
      const allList = client.post.list.useQuery({ cursor: 0 });
      const allListInfinite = client.post.list.useInfiniteQuery(
        { cursor: '0' },
        {
          // We don't care about the cursor here
          getNextPageParam: () => undefined,
        },
      );
      const utils = client.useUtils();

      useEffect(() => {
        utils.post.list.cancel();
      });

      return (
        <div>
          <p data-testid="data">{allList.data ? 'data loaded' : 'undefined'}</p>
          <p data-testid="isFetching">
            {allList.isFetching ? 'fetching' : 'idle'}
          </p>
          <p data-testid="isPaused">
            {allList.isPaused ? 'paused' : 'not paused'}
          </p>
          <p data-testid="dataInfinite">
            {allListInfinite.data ? 'data loaded' : 'undefined'}
          </p>
          <p data-testid="isFetchingInfinite">
            {allListInfinite.isFetching ? 'fetching' : 'idle'}
          </p>
          <p data-testid="isPausedInfinite">
            {allListInfinite.isPaused ? 'paused' : 'not paused'}
          </p>
        </div>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.getByTestId('data')).toHaveTextContent('undefined');
      expect(utils.getByTestId('isFetching')).toHaveTextContent('idle');
      expect(utils.getByTestId('isPaused')).toHaveTextContent('paused');
      expect(utils.getByTestId('dataInfinite')).toHaveTextContent('undefined');
      expect(utils.getByTestId('isFetchingInfinite')).toHaveTextContent('idle');
      expect(utils.getByTestId('isPausedInfinite')).toHaveTextContent('paused');
    });
  });

  test('typeerrors and continues with signal', async () => {
    const { client, App } = ctx;

    function MyComponent() {
      const ac = new AbortController();
      const allPosts = client.post.all.useQuery(undefined, {
        // @ts-expect-error Signal not allowed for React Query. We use the internal signal instead
        trpc: { signal: ac.signal },
      });

      // this is not how you cancel a query in @trpc/react-query, so query should still be valid
      ac.abort();

      if (!allPosts.data) {
        return <>...</>;
      }

      return (
        <ul>
          {allPosts.data.map((post) => (
            <li key={post.id}>{post.text}</li>
          ))}
        </ul>
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
});

describe('query keys are stored separately', () => {
  test('getInfiniteData() does not data from useQuery()', async () => {
    const { client, App } = ctx;
    const unset = '__unset';
    const data = {
      infinite: unset as unknown,
      query: unset as unknown,
    };
    function MyComponent() {
      const utils = client.useUtils();
      const { data: posts } = client.post.all.useQuery();

      useEffect(() => {
        if (posts === undefined) return;
        data.infinite = utils.post.all.getInfiniteData();
        data.query = utils.post.all.getData();
      }, [posts]);

      return (
        <div>
          <p data-testid="initial-post">{posts?.[0]?.text}</p>
        </div>
      );
    }
    render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(data.infinite).not.toBe(unset);
      expect(data.query).not.toBe(unset);
    });
    expect(data.query).toMatchInlineSnapshot(`
      Array [
        Object {
          "id": 0,
          "text": "new post",
        },
      ]
    `);
    expect(data.infinite).toBeUndefined();
  });
});

test('isMutating', async () => {
  const { client, App } = ctx;

  function MyComponent() {
    const createPostMutation = client.post.create.useMutation();
    const isMutating = client.useUtils().post.create.isMutating();
    const [isMutatingHistory, setIsMutatingHistory] = useState<number[]>([]);

    useEffect(() => {
      setIsMutatingHistory((prev) => {
        const last = prev[prev.length - 1];
        return last !== isMutating ? [...prev, isMutating] : prev;
      });
    });

    return (
      <>
        <button
          data-testid="add-post"
          onClick={() => {
            createPostMutation.mutate({ text: '' });
          }}
        />
        <span data-testid="is-mutating-history">
          {isMutatingHistory.join(',')}
        </span>
      </>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  const addPostButton = await utils.findByTestId('add-post');
  const isMutatingHistorySpan = await utils.findByTestId('is-mutating-history');

  await userEvent.click(addPostButton);
  await waitFor(() => {
    expect(isMutatingHistorySpan).toHaveTextContent('0,1,0');
  });
});
