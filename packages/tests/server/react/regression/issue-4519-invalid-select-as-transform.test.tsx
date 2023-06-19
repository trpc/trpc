import { getServerAndReactClient } from '../__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { inferProcedureOutput, initTRPC } from '@trpc/server';
import { konn } from 'konn';
import * as React from 'react';
import * as z from 'zod';

/**
 * For reference,
 * @see https://github.com/trpc/trpc/issues/4519
 */

const ctx = konn()
  .beforeEach(() => {
    const { router, procedure } = initTRPC.create();

    const appRouter = router({
      greeting: procedure
        .input(
          z.object({
            name: z.string().nullish(),
          }),
        )
        .query(({ input }) => {
          return {
            text: `hello ${input?.name ?? 'world'}`,
          };
        }),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('select as transform', async () => {
  const { proxy, App } = ctx;

  function MyComponent() {
    const result = proxy.greeting.useQuery(undefined, {
      select(data) {
        // remap text prop to foo
        return { foo: data.text };
      },
    });

    type AppRouter = typeof ctx.appRouter;
    type Data = inferProcedureOutput<AppRouter['greeting']>;
    expectTypeOf(result.data).not.toMatchTypeOf<Data>();
    expectTypeOf<{ foo: string }>(result.data);

    return <pre>{JSON.stringify(result.data)}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`{"foo":"hello world"}`);
  });
});
