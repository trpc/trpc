import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server';
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
  const { client, App } = ctx;
  function MyComponent() {
    const [posts] = client.useSuspenseQueries((t) => [
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

    expectTypeOf(posts[0]).toEqualTypeOf<`__result${string}`>();
    expectTypeOf(posts[1]).toEqualTypeOf<`__RESULT${Uppercase<string>}`>();

    return <pre>{JSON.stringify(posts[0] ?? 'n/a', null, 4)}</pre>;
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
  const { client, App } = ctx;
  function MyComponent() {
    const [posts] = client.useSuspenseQueries((t) => [t.foo(), t.bar()]);

    expectTypeOf(posts[0]).toEqualTypeOf<'foo'>();
    expectTypeOf(posts[1]).toEqualTypeOf<'bar'>();

    return <pre>{JSON.stringify(posts ?? 'n/a', null, 4)}</pre>;
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

  const { client, App } = ctx;
  function MyComponent() {
    const [posts] = client.useSuspenseQueries((t) =>
      ids.map((id) => t.post.byId({ id })),
    );

    expectTypeOf(posts).toEqualTypeOf<`__result${string}`[]>();

    return <pre>{JSON.stringify(posts ?? 'n/a', null, 4)}</pre>;
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

test('disallowed options', async () => {
  const { client, App } = ctx;

  function MyComponent() {
    const [posts] = client.useSuspenseQueries((t) => [
      t.post.byId(
        { id: '1' },
        {
          // @ts-expect-error -- can't set suspense to false
          suspense: false,
        },
      ),
      t.post.byId(
        { id: '2' },
        {
          // @ts-expect-error -- can't set placeholderData
          placeholderData: '123',
        },
      ),
    ]);

    return <pre>{JSON.stringify(posts ?? 'n/a', null, 4)}</pre>;
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

// regression https://github.com/trpc/trpc/issues/4802
test('regression #4802: passes context to links', async () => {
  const { client, App } = ctx;

  function MyComponent() {
    const [posts] = client.useSuspenseQueries((t) => [
      t.post.byId(
        { id: '1' },
        {
          trpc: {
            context: {
              id: '1',
            },
          },
        },
      ),
      t.post.byId(
        { id: '2' },
        {
          trpc: {
            context: {
              id: '2',
            },
          },
        },
      ),
    ]);
    if (posts.some((v) => !v)) {
      return <>...</>;
    }

    return <pre>{JSON.stringify(posts, null, 4)}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`__result1`);
    expect(utils.container).toHaveTextContent(`__result2`);
  });

  expect(ctx.spyLink).toHaveBeenCalledTimes(2);
  const ops = ctx.spyLink.mock.calls.map((it) => it[0]);

  expect(ops[0]!.context).toEqual({
    id: '1',
  });
  expect(ops[1]!.context).toEqual({
    id: '2',
  });
});
