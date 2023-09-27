import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server/src';
import { konn } from 'konn';
import React from 'react';
import { z } from 'zod';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      post: t.router({
        byId: t.procedure
          .input(
            z.object({
              id: z.string(),
            }),
          )
          .query(() => '__result' as const),
      }),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();
test('useSuspenseQuery()', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const [data, query1] = proxy.post.byId.useSuspenseQuery({
      id: '1',
    });
    expectTypeOf(data).toEqualTypeOf<'__result'>();

    type TData = typeof data;
    expectTypeOf<TData>().toMatchTypeOf<'__result'>();
    expect(data).toBe('__result');
    expect(query1.data).toBe('__result');

    return <>{query1.data}</>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`__result`);
  });
});
