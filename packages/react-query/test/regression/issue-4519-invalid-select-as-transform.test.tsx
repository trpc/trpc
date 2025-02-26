import { getServerAndReactClient } from '../__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import type { inferProcedureOutput } from '@trpc/server';
import { initTRPC } from '@trpc/server';
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
  const { client, App } = ctx;

  function MyComponent() {
    const result = client.greeting.useQuery(
      { name: 'foo' },
      {
        select(data) {
          // remap text prop to foo
          return { foo: data.text };
        },
      },
    );

    if (!result.data) return null;

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
    expect(utils.container).toHaveTextContent(`{"foo":"hello foo"}`);
  });
});

test('select as transform in suspense', async () => {
  const { client, App } = ctx;

  function MyComponent() {
    const [data] = client.greeting.useSuspenseQuery(
      { name: 'foo' },
      {
        select(data) {
          // remap text prop to foo
          return { foo: data.text };
        },
      },
    );

    type AppRouter = typeof ctx.appRouter;
    type Data = inferProcedureOutput<AppRouter['greeting']>;
    expectTypeOf(data).not.toMatchTypeOf<Data>();
    expectTypeOf<{ foo: string }>(data);

    return <pre>{JSON.stringify(data)}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`{"foo":"hello foo"}`);
  });
});

test('select as transform with initial data', async () => {
  const { client, App } = ctx;

  function MyComponent() {
    // @ts-expect-error - initialData must match the procedure output, not the select
    client.greeting.useQuery(
      { name: 'foo' },
      {
        select(data) {
          // remap text prop to foo
          return { foo: data.text };
        },
        initialData: {
          foo: 'hello foo',
        },
      },
    );

    const { data } = client.greeting.useQuery(
      { name: 'foo' },
      {
        select(data) {
          // remap text prop to foo
          return { foo: data.text };
        },
        initialData: {
          text: 'hello foo',
        },
      },
    );

    type AppRouter = typeof ctx.appRouter;
    type Data = inferProcedureOutput<AppRouter['greeting']>;
    expectTypeOf(data).not.toMatchTypeOf<Data>();
    expectTypeOf<{ foo: string }>(data);

    return <pre>{JSON.stringify(data)}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`{"foo":"hello foo"}`);
  });
});
