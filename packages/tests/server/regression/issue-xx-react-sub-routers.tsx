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
      foo: t.router({
        bar: t.procedure.query(() => 'foobar'),
      }),
    });
    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('short-hand routers with React', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const allPosts = proxy.foo.bar.useQuery();

    return <>{allPosts.data}</>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent('foobar');
  });
});
