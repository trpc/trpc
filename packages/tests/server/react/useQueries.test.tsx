import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server/src/index';
import { expectTypeOf } from 'expect-type';
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
          .query(({ input }) => `__result${input.id}` as const),
      }),
      foo: t.procedure.query(() => 'foo' as const),
      bar: t.procedure.query(() => 'bar' as const),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('single query', async () => {
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
    expect(utils.container).toHaveTextContent(`__result1`);
  });
});

test('different queries', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const results = proxy.useQueries((t) => [t.foo(), t.bar()]);

    const foo = results[0].data;
    const bar = results[1].data;
    if (foo && bar) {
      expectTypeOf(results[0].data).toEqualTypeOf<'foo'>();
      expectTypeOf(results[1].data).toEqualTypeOf<'bar'>();
    }

    return (
      <pre>{JSON.stringify(results.map((v) => v.data) ?? 'n/a', null, 4)}</pre>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`foo`);
    expect(utils.container).toHaveTextContent(`bar`);
  });
});

test('mapping queries', async () => {
  const ids = ['1', '2', '3'];

  const { proxy, App } = ctx;
  function MyComponent() {
    const results = proxy.useQueries((t) =>
      ids.map((id) => t.post.byId({ id })),
    );

    if (results[0]?.data) {
      //             ^?
      expectTypeOf(results[0].data).toEqualTypeOf<`__result${string}`>();
    }

    return (
      <pre>{JSON.stringify(results.map((v) => v.data) ?? 'n/a', null, 4)}</pre>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`__result1`);
    expect(utils.container).toHaveTextContent(`__result2`);
    expect(utils.container).toHaveTextContent(`__result3`);
  });
});

test('single query with options', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const results = proxy.useQueries((t) => [
      t.post.byId(
        { id: '1' },
        { enabled: false, placeholderData: '__result2' },
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
    expect(utils.container).toHaveTextContent(`__result2`);
  });
});
