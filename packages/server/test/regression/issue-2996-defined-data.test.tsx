import { getServerAndReactClient } from '../react/__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React from 'react';
import { initTRPC } from '../../src';

const posts = [
  { id: 1, title: 'foo' },
  { id: 2, title: 'bar' },
];
type Post = typeof posts[number];

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const appRouter = t.router({
      post: t.router({
        list: t.procedure.query(() => {
          return posts as Post[];
        }),
      }),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('destructuring data', async () => {
  const { App, proxy } = ctx;

  function MyComponent() {
    const { data: data1 = [] } = proxy.post.list.useQuery();

    type TData = typeof data1;
    expectTypeOf<TData>().toEqualTypeOf<Post[]>();

    if (!data1) {
      // should not happen
      return <div>Loading...</div>;
    }
    if (data1.length === 0) {
      return <div>No posts</div>;
    }
    return <div>{data1.map((post) => post.title).join(', ')}</div>;
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

test('using ìnitialData`', async () => {
  const { App, proxy } = ctx;

  function MyComponent() {
    const { data } = proxy.post.list.useQuery(undefined, { initialData: [] });

    type TData = typeof data;
    expectTypeOf<TData>().toEqualTypeOf<Post[]>();

    if (!data) {
      // should not happen
      return <div>Loading...</div>;
    }
    if (data.length === 0) {
      return <div>No posts</div>;
    }
    return <div>{data.map((post) => post.title).join(', ')}</div>;
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
  const { App, proxy } = ctx;

  function MyComponent() {
    const { data } = proxy.post.list.useQuery(undefined, {
      placeholderData: [],
    });

    type TData = typeof data;
    expectTypeOf<TData>().toEqualTypeOf<Post[] | undefined>();

    if (!data) {
      // should not happen
      return <div>Loading...</div>;
    }
    if (data.length === 0) {
      return <div>No posts</div>;
    }
    return <div>{data.map((post) => post.title).join(', ')}</div>;
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
