import { getServerAndReactClient } from '../__reactHelpers';
import { useQuery } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React from 'react';

const posts = [
  { id: 1, title: 'foo' },
  { id: 2, title: 'bar' },
];
type Post = (typeof posts)[number];

const fetchPosts = async () => posts;

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const appRouter = t.router({
      posts: t.procedure.query(fetchPosts),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('destructuring data', async () => {
  const { App, client } = ctx;

  function MyComponent() {
    const { data: trpcData = [] } = client.posts.useQuery();
    expectTypeOf<typeof trpcData>().toEqualTypeOf<Post[]>();

    // verify tanstack returns the same
    const { data: rqData = [] } = useQuery({
      queryKey: ['key'],
      queryFn: fetchPosts,
    });
    expectTypeOf<typeof rqData>().toEqualTypeOf<Post[]>();

    if (!trpcData) throw new Error('should not happen');

    if (trpcData.length === 0) return <div>No posts</div>;
    return <div>{trpcData.map((post) => post.title).join(', ')}</div>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  expect(utils.container).toHaveTextContent('No posts');
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('foo, bar');
  });
});

test('using `initialData`', async () => {
  const { App, client } = ctx;

  function MyComponent() {
    const { data: trpcData } = client.posts.useQuery(undefined, {
      initialData: [],
    });
    expectTypeOf<typeof trpcData>().toEqualTypeOf<Post[]>();

    // verify tanstack returns the same
    const { data: rqData } = useQuery({
      queryKey: ['key'],
      queryFn: fetchPosts,
      initialData: [],
    });
    expectTypeOf<typeof rqData>().toEqualTypeOf<Post[]>();

    if (!trpcData) throw new Error('should not happen');

    if (trpcData.length === 0) return <div>No posts</div>;
    return <div>{trpcData.map((post) => post.title).join(', ')}</div>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  expect(utils.container).toHaveTextContent('No posts');
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('foo, bar');
  });
});

test('using `placeholderData`', async () => {
  const { App, client } = ctx;

  function MyComponent() {
    const { data: trpcData } = client.posts.useQuery(undefined, {
      placeholderData: [],
    });
    expectTypeOf<typeof trpcData>().toEqualTypeOf<Post[] | undefined>();

    // verify tanstack returns the same
    const { data: rqData } = useQuery({
      queryKey: ['key'],
      queryFn: fetchPosts,
      placeholderData: [],
    });
    expectTypeOf<typeof rqData>().toEqualTypeOf<Post[] | undefined>();

    if (!trpcData) throw new Error('should not happen');

    if (trpcData.length === 0) return <div>No posts</div>;
    return <div>{trpcData.map((post) => post.title).join(', ')}</div>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  expect(utils.container).toHaveTextContent('No posts');
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('foo, bar');
  });
});
