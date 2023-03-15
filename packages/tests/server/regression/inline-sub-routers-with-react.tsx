import { getServerAndReactClient } from '../react/__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server/src';
import { konn } from 'konn';
import React from 'react';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      foo: {
        query: t.procedure.query(() => 'foobar'),
        mutation: t.procedure.mutation(() => 'foobar'),
      },
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
    const allPosts = proxy.foo.query.useQuery();
    proxy.foo.mutation.useMutation();

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
