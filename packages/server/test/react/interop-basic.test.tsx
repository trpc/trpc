import { routerToServerAndClientNew } from '../___testHelpers';
import { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { createReactQueryHooks, createReactQueryHooksProxy } from '@trpc/react';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useState } from 'react';
import { z } from 'zod';
import * as trpc from '../../src';
import { inferProcedureOutput, initTRPC } from '../../src';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC()();
    const legacyRouter = trpc.router().query('oldProcedure', {
      input: z.string().optional(),
      resolve({ input }) {
        return `oldProcedureOutput__input:${input ?? 'n/a'}`;
      },
    });

    const legacyRouterInterop = legacyRouter.interop();
    const newAppRouter = t.router({
      newProcedure: t.procedure.query(() => 'newProcedureOutput'),
    });

    const appRouter = t.mergeRouters(legacyRouterInterop, newAppRouter);
    const opts = routerToServerAndClientNew(appRouter, {});
    const queryClient = new QueryClient();
    const react = createReactQueryHooks<typeof opts['router']>();
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

  // FIXME // @ts-expect-error we can't call oldProcedure with proxy
  expect(await opts.proxy.oldProcedure()).toBe('oldProcedureOutput__input:n/a');

  // @ts-expect-error we can't call new procedures without proxy
  expect(await opts.client.query('newProcedure')).toBe('newProcedureOutput');

  expect(await opts.proxy.newProcedure()).toBe('newProcedureOutput');
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
    const [queryClient] = useState(() => new QueryClient());
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
  const { react, client, appRouter } = ctx;
  const proxy = createReactQueryHooksProxy<typeof appRouter>(react);
  function MyComponent() {
    const query1 = proxy.newProcedure.useQuery();
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
    const [queryClient] = useState(() => new QueryClient());
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
