import { routerToServerAndClientNew } from './___testHelpers';
import { render, waitFor } from '@testing-library/react';
import { createReactQueryHooks, createReactQueryProxy } from '@trpc/react';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useState } from 'react';
import { QueryClient } from 'react-query';
import { QueryClientProvider } from 'react-query';
import { z } from 'zod';
import * as trpc from '../src';
import { inferProcedureOutput, initTRPC } from '../src';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC()();
    const legacyRouter = trpc.router().query('greeting', {
      input: z.string().optional(),
      resolve({ input }) {
        return `hello ${input ?? 'world'}`;
      },
    });
    const newAppRouter = t.router({
      whoami: t.procedure.query(() => "I am just a test, I don't know! "),
    });
    const appRouter = t.mergeRouters(legacyRouter.interop(), newAppRouter);
    const opts = routerToServerAndClientNew(appRouter, {});
    const queryClient = new QueryClient();
    const react = createReactQueryHooks<typeof opts['router']>();
    const client = opts.client;
    type Return = inferProcedureOutput<
      typeof opts.router._def.queries.greeting
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

  expect(await opts.client.query('greeting')).toBe('hello world');
  expect(await opts.proxy.greeting.query()).toBe('hello world');
});

test('useQuery()', async () => {
  const { react, client } = ctx;
  function MyComponent() {
    const query1 = react.useQuery(['greeting']);
    const query2 = react.useQuery(['greeting', 'KATT']);
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
    expect(utils.container).toHaveTextContent(`hello world`);
    expect(utils.container).toHaveTextContent(`hello KATT`);
  });
});

test("we can use new router's procedures too", async () => {
  const { react, client, appRouter } = ctx;
  const proxy = createReactQueryProxy<typeof appRouter>(react);
  function MyComponent() {
    const query1 = proxy.whoami.useQuery();
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
    expect(utils.container).toHaveTextContent(`I am just a test`);
  });
});
