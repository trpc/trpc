import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React, { useEffect } from 'react';
import { z } from 'zod';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      greeting: t.procedure
        .input(
          z.object({
            id: z.string(),
          }),
        )
        .query(() => '__result' as const),
      doSomething: t.procedure
        .input(
          z.object({
            id: z.string(),
          }),
        )
        .mutation(() => '__result' as const),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('useQuery()', async () => {
  const { client, App } = ctx;
  function MyComponent() {
    const greetingQuery = client.greeting.useQuery(
      {
        id: '1',
      },
      {
        trpc: {
          context: {
            foo: 'bar',
          },
        },
      },
    );

    return <pre>{JSON.stringify(greetingQuery.data ?? 'n/a', null, 4)}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`__result`);
  });
  expect(ctx.spyLink).toHaveBeenCalledTimes(1);
  const firstCall = ctx.spyLink.mock.calls[0]![0];
  expect(firstCall.context['foo']).toBe('bar');
  expect(firstCall).toMatchInlineSnapshot(`
    Object {
      "context": Object {
        "foo": "bar",
      },
      "id": 1,
      "input": Object {
        "id": "1",
      },
      "path": "greeting",
      "signal": null,
      "type": "query",
    }
  `);
});

test('useMutation()', async () => {
  const { client, App } = ctx;
  function MyComponent() {
    const doSomethingMutation = client.doSomething.useMutation({
      trpc: {
        context: {
          foo: 'bar',
        },
      },
    });

    useEffect(() => {
      doSomethingMutation.mutate({
        id: '1',
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <pre>{JSON.stringify(doSomethingMutation.data ?? 'n/a', null, 4)}</pre>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`__result`);
  });
  expect(ctx.spyLink).toHaveBeenCalledTimes(1);
  const firstCall = ctx.spyLink.mock.calls[0]![0];
  expect(firstCall.context['foo']).toBe('bar');
  expect(firstCall).toMatchInlineSnapshot(`
    Object {
      "context": Object {
        "foo": "bar",
      },
      "id": 1,
      "input": Object {
        "id": "1",
      },
      "path": "doSomething",
      "signal": undefined,
      "type": "mutation",
    }
  `);
});
