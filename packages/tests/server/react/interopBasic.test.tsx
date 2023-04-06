import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { createReactQueryHooks, httpBatchLink } from '@trpc/react-query/src';
import * as interop from '@trpc/server/src';
import { inferProcedureOutput, initTRPC } from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useState } from 'react';
import superjson from 'superjson';
import { z } from 'zod';

type Context = {
  foo: 'bar';
};
const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.context<Context>().create();
    const legacyRouter = interop
      .router<Context>()
      .transformer(superjson)
      .query('oldProcedure', {
        input: z.string().optional(),
        resolve({ input }) {
          return `oldProcedureOutput__input:${input ?? 'n/a'}`;
        },
      });

    const legacyRouterInterop = legacyRouter.interop();

    expectTypeOf(legacyRouterInterop._def.queries.oldProcedure).not.toBeNever();

    const newAppRouter = t.router({
      newProcedure: t.procedure.query(() => 'newProcedureOutput'),
    });

    const appRouter = t.mergeRouters(legacyRouterInterop, newAppRouter);

    const opts = routerToServerAndClientNew(appRouter, {
      server: {
        createContext() {
          return {
            foo: 'bar',
          };
        },
      },
      client({ httpUrl }) {
        return {
          transformer: superjson,
          links: [
            httpBatchLink({
              url: httpUrl,
            }),
          ],
        };
      },
    });
    const queryClient = createQueryClient();
    const react = createReactQueryHooks<(typeof opts)['router']>();
    const client = opts.client;
    type Return = inferProcedureOutput<
      typeof opts.router._def.queries.oldProcedure
    >;

    expectTypeOf<Return>().toMatchTypeOf<string>();

    return {
      opts,
      close: opts.close,
      client,
      queryClient,
      react,
      appRouter,
      legacyRouterInterop,
    };
  })
  .afterEach(async (ctx) => {
    await ctx?.opts?.close?.();
  })
  .done();

test('interop inference', async () => {
  const { opts } = ctx;

  expect(await opts.client.query('oldProcedure')).toBe(
    'oldProcedureOutput__input:n/a',
  );

  // @ts-expect-error we can't call oldProcedure with proxy
  expect(await opts.proxy.oldProcedure.query()).toBe(
    'oldProcedureOutput__input:n/a',
  );

  // @ts-expect-error we can't call new procedures without proxy
  expect(await opts.client.query('newProcedure')).toBe('newProcedureOutput');

  expect(await opts.proxy.newProcedure.query()).toBe('newProcedureOutput');
});

test('useQuery()', async () => {
  const { react, client } = ctx;
  function MyComponent() {
    const query1 = react.useQuery(['oldProcedure']);
    const query2 = react.useQuery(['oldProcedure', 'KATT']);
    if (!query1.data || !query2.data) {
      return <>...</>;
    }
    expectTypeOf(query1.data).not.toBeAny();
    expectTypeOf(query1.data).toMatchTypeOf<string>();

    return (
      <pre>
        {JSON.stringify(
          { query1: query1.data, query2: query2.data } ?? 'n/a',
          null,
          4,
        )}
      </pre>
    );
  }
  function App() {
    const [queryClient] = useState(() => createQueryClient());
    return (
      <react.Provider {...{ queryClient, client }}>
        <QueryClientProvider client={queryClient}>
          <MyComponent />
        </QueryClientProvider>
      </react.Provider>
    );
  }

  const utils = render(<App />);
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`oldProcedureOutput__input:n/a`);
    expect(utils.container).toHaveTextContent(`oldProcedureOutput__input:KATT`);
  });
});

test("we can use new router's procedures too", async () => {
  const { react, client } = ctx;

  function MyComponent() {
    const query1 = react.proxy.newProcedure.useQuery();
    if (!query1.data) {
      return <>...</>;
    }
    expectTypeOf(query1.data).not.toBeAny();
    expectTypeOf(query1.data).toMatchTypeOf<string>();

    return (
      <pre>{JSON.stringify({ query1: query1.data } ?? 'n/a', null, 4)}</pre>
    );
  }
  function App() {
    const [queryClient] = useState(() => createQueryClient());
    return (
      <react.Provider {...{ queryClient, client }}>
        <QueryClientProvider client={queryClient}>
          <MyComponent />
        </QueryClientProvider>
      </react.Provider>
    );
  }

  const utils = render(<App />);
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`newProcedureOutput`);
  });
});

test("old procedures can't be used in interop", async () => {
  const { react, client } = ctx;

  function MyComponent() {
    // @ts-expect-error we can't call oldProcedure with proxy
    react.proxy.oldProcedure.useQuery();

    return <>__hello</>;
  }
  function App() {
    const [queryClient] = useState(() => createQueryClient());
    return (
      <react.Provider {...{ queryClient, client }}>
        <QueryClientProvider client={queryClient}>
          <MyComponent />
        </QueryClientProvider>
      </react.Provider>
    );
  }

  render(<App />);
});

test('createCaller', async () => {
  {
    const caller = ctx.appRouter.createCaller({
      foo: 'bar',
    });
    expect(await caller.newProcedure()).toBe('newProcedureOutput');
    expect(await caller.query('oldProcedure')).toBe(
      'oldProcedureOutput__input:n/a',
    );
  }
  {
    const caller = ctx.legacyRouterInterop.createCaller({
      foo: 'bar',
    });
    expect(await caller.query('oldProcedure')).toBe(
      'oldProcedureOutput__input:n/a',
    );
  }
  {
    const asyncFnThatReturnsCaller = async () =>
      ctx.legacyRouterInterop.createCaller({
        foo: 'bar',
      });
    const caller = await asyncFnThatReturnsCaller();
    expect(await caller.query('oldProcedure')).toBe(
      'oldProcedureOutput__input:n/a',
    );
  }
});
