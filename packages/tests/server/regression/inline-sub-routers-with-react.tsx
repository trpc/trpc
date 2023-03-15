import { getServerAndReactClient } from '../react/__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server/src';
import { konn } from 'konn';
import React, { useEffect } from 'react';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      foo: {
        query: t.procedure.query(() => 'foobar' as const),
        mutation: t.procedure.mutation(() => 'foobar' as const),
      },
      moo: t.procedure.query(() => 'moo'),
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
    const fooQuery = proxy.foo.query.useQuery();
    proxy.foo.mutation;
    proxy.moo.useQuery();
    proxy.useQueries((t) => [t.moo(), t.foo.query()]);
    const utils = proxy.useContext();

    useEffect(() => {
      utils.foo.query.invalidate();
      utils.client.foo.query.query();
      utils.client.moo.query();
    }, [utils]);

    if (!fooQuery.data) {
      return <>...</>;
    }
    expectTypeOf(fooQuery.data).toEqualTypeOf<'foobar'>();

    return <>{fooQuery.data}</>;
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
