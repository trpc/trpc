import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server/src';
import { konn } from 'konn';
import React from 'react';
import { z } from 'zod';

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

test('useQueries() single query', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const results = proxy.useQueries((t) => [
      t.post.byId({ id: '1' }),
      t.post.byId(
        { id: '1' },
        {
          select(data) {
            return data as Uppercase<typeof data>;
          },
        },
      ),
    ]);

    return <pre>{JSON.stringify(results[0].data ?? 'n/a', null, 4)}</pre>;
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
