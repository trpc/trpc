/* eslint-disable react-hooks/exhaustive-deps */
import { getServerAndReactClient } from './__reactHelpers';
import { useIsFetching } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server/src/core';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useEffect, useState } from 'react';
import { z } from 'zod';

jest.retryTimes(3);

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

test('client query', async () => {
  const { proxy, App } = ctx;

  function MyComponent() {
    const utils = proxy.useContext();
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
  const { proxy, App } = ctx;

  function MyComponent() {
    const utils = proxy.useContext();
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const { proxy, App } = ctx;

  function MyComponent() {
    const utils = proxy.useContext();
    const { data: posts } = proxy.post.all.useQuery();
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
  const { proxy, App } = ctx;

  function MyComponent() {
    const utils = proxy.useContext();
    const [posts, setPosts] = useState<Post[]>([]);

    useEffect(() => {
      utils.post.all.fetch().then((allPosts) => {
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
    const allPosts = proxy.post.all.useQuery(undefined, {
      onSuccess: () => {
        stableProxySpy();
      },
    });
    const createPostMutation = proxy.post.create.useMutation();

    const utils = proxy.useContext();

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

  expect(stableProxySpy).toHaveBeenCalledTimes(1);

  const addPostButton = await utils.findByTestId('add-post');

  await userEvent.click(addPostButton);
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('invalidate');
  });
  expect(stableProxySpy).toHaveBeenCalledTimes(2);
});

test('invalidate procedure for both query and infinite', async () => {
  const { proxy, App } = ctx;
  const invalidateQuerySpy = jest.fn();
  const invalidateInfiniteSpy = jest.fn();

  function MyComponent() {
    const allPostsList = proxy.post.list.useQuery(
      { cursor: undefined },
      {
        onSuccess: invalidateQuerySpy,
      },
    );
    const allPostsListInfinite = proxy.post.list.useInfiniteQuery(
      { cursor: undefined },
      { onSuccess: invalidateInfiniteSpy },
    );

    const utils = proxy.useContext();

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
            return page.map((post) => {
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
  });
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

test('setInfiniteData', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const listPosts = proxy.post.list.useInfiniteQuery({}, { enabled: false });

    const utils = proxy.useContext();

    useEffect(() => {
      if (!listPosts.data) {
        utils.post.list.setInfiniteData(
          {},
          {
            pageParams: [{}],
            pages: [[{ id: 0, text: 'setInfiniteData1' }]],
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
            pageParams: [
              ...data.pageParams,
              {
                cursor: 1,
              },
            ],
            pages: [
              ...data.pages,
              [
                {
                  id: 1,
                  text: 'setInfiniteData2',
                },
              ],
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
  });
  expect(utils.container).toMatchInlineSnapshot(`
    <div>
      {
        "pageParams": [
            {},
            {
                "cursor": 1
            }
        ],
        "pages": [
            [
                {
                    "id": 0,
                    "text": "setInfiniteData1"
                }
            ],
            [
                {
                    "id": 1,
                    "text": "setInfiniteData2"
                }
            ]
        ]
    }
    </div>
  `);
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

describe('cancel', () => {
  test('aborts with utils', async () => {
    const { proxy, App } = ctx;
    function MyComponent() {
      const allPosts = proxy.post.all.useQuery();
      const utils = proxy.useContext();

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
    const { proxy, App } = ctx;
    function MyComponent() {
      const allList = proxy.post.list.useQuery({ cursor: '0' });
      const allListInfinite = proxy.post.list.useInfiniteQuery({ cursor: '0' });
      const utils = proxy.useContext();

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
    const { proxy, App } = ctx;

    function MyComponent() {
      const ac = new AbortController();
      const allPosts = proxy.post.all.useQuery(undefined, {
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

describe('query keys are stored separtely', () => {
  test('getInfiniteData() does not data from useQuery()', async () => {
    const { proxy, App } = ctx;

    const unset = '__unset' as const;
    const data = {
      infinite: unset as unknown,
      query: unset as unknown,
    };
    function MyComponent() {
      const utils = proxy.useContext();
      const { data: posts } = proxy.post.all.useQuery(undefined, {
        onSuccess() {
          data.infinite = utils.post.all.getInfiniteData();
          data.query = utils.post.all.getData();
        },
      });

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

  describe('getQueryKeys', () => {
    test('no input', async () => {
      const { proxy, App } = ctx;

      function MyComponent() {
        const utils = proxy.useContext();
        const happy = utils.post.all.getQueryKey(undefined, 'query');

        // @ts-expect-error - post.all has no input
        const sad1 = utils.post.all.getQueryKey('foo');
        // @ts-expect-error - need to specify type
        const sad2 = utils.post.all.getQueryKey(undefined);

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
        const utils = proxy.useContext();
        const happy = utils.post.byId.getQueryKey({ id: 1 }, 'query');

        // @ts-expect-error - post.byId has required input
        const sad1 = utils.post.byId.getQueryKey(undefined, 'query');
        // @ts-expect-error - need to specify type
        const sad2 = utils.post.byId.getQueryKey();

        return <pre data-testid="qKey">{JSON.stringify(happy)}</pre>;
      }

      const utils = render(
        <App>
          <MyComponent />
        </App>,
      );

      await waitFor(() => {
        expect(utils.getByTestId('qKey')).toHaveTextContent(
          JSON.stringify([
            ['post', 'byId'],
            { input: { id: 1 }, type: 'query' },
          ]),
        );
      });
    });

    test('on router', async () => {
      const { proxy, App } = ctx;

      function MyComponent() {
        const utils = proxy.useContext();
        const happy = utils.post.getQueryKey(undefined, 'any');

        // @ts-expect-error - router has no input
        const sad = utils.post.getQueryKey('foo', 'any');

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
        const utils = proxy.useContext();
        proxy.post.all.useQuery();
        const qKey = utils.post.all.getQueryKey(undefined, 'query');
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
});
