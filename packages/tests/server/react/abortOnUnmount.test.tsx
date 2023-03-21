import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider, useIsFetching } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React, { ReactNode, useState } from 'react';
import { z } from 'zod';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      greeting: t.procedure.input(z.string()).query(async (opts) => {
        await new Promise((r) => setTimeout(r, 2000));
        return { text: 'Hello' + opts.input };
      }),
    });

    const queryClient = createQueryClient();
    const proxy = createTRPCReact<typeof appRouter>();
    const opts = routerToServerAndClientNew(appRouter);

    return { ...opts, proxy, queryClient };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('abortOnUnmount', async () => {
  const { proxy, httpUrl, queryClient } = ctx;

  function App(props: { children: ReactNode }) {
    const [client] = useState(() =>
      proxy.createClient({
        links: [
          httpBatchLink({
            url: httpUrl,
          }),
        ],
        abortOnUnmount: true,
      }),
    );
    return (
      <proxy.Provider {...{ queryClient, client }}>
        <QueryClientProvider client={queryClient}>
          {props.children}
        </QueryClientProvider>
      </proxy.Provider>
    );
  }

  function MyComponent() {
    const [query, setQuery] = useState(1);
    const x = useIsFetching();
    return (
      <div>
        <button data-testid="setQ1" onClick={() => setQuery(1)} />
        <button data-testid="setQ2" onClick={() => setQuery(2)} />
        {query === 1 && <Query1 />}
        {query === 2 && <Query2 />}
        <div>isFetching: {x}</div>
      </div>
    );
  }

  function Query1() {
    const query = proxy.greeting.useQuery('tRPC greeting 1');
    return <div>{query.data?.text ?? 'Loading 1'}</div>;
  }

  function Query2() {
    const query = proxy.greeting.useQuery('tRPC greeting 2');
    return <div>{query.data?.text ?? 'Loading 2'}</div>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.getByText('Loading 1')).toBeInTheDocument();
    expect(utils.getByText('isFetching: 1')).toBeInTheDocument();
  });

  await userEvent.click(utils.getByTestId('setQ2'));
  expect(utils.getByText('Loading 2')).toBeInTheDocument();
  // query1 should not finish so isFetching should be 1
  expect(utils.getByText('isFetching: 1')).toBeInTheDocument();
});

test('abortOnUnmount false', async () => {
  const { proxy, httpUrl, queryClient } = ctx;

  function App(props: { children: ReactNode }) {
    const [client] = useState(() =>
      proxy.createClient({
        links: [
          httpBatchLink({
            url: httpUrl,
          }),
        ],
        abortOnUnmount: false,
      }),
    );
    return (
      <proxy.Provider {...{ queryClient, client }}>
        <QueryClientProvider client={queryClient}>
          {props.children}
        </QueryClientProvider>
      </proxy.Provider>
    );
  }

  function MyComponent() {
    const [query, setQuery] = useState(1);
    const x = useIsFetching();
    return (
      <div>
        <button data-testid="setQ1" onClick={() => setQuery(1)} />
        <button data-testid="setQ2" onClick={() => setQuery(2)} />
        {query === 1 && <Query1 />}
        {query === 2 && <Query2 />}
        <div>isFetching: {x}</div>
      </div>
    );
  }

  function Query1() {
    const query = proxy.greeting.useQuery('tRPC greeting 1');
    return <div>{query.data?.text ?? 'Loading 1'}</div>;
  }

  function Query2() {
    const query = proxy.greeting.useQuery('tRPC greeting 2');
    return <div>{query.data?.text ?? 'Loading 2'}</div>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.getByText('Loading 1')).toBeInTheDocument();
    expect(utils.getByText('isFetching: 1')).toBeInTheDocument();
  });

  await userEvent.click(utils.getByTestId('setQ2'));
  expect(utils.getByText('Loading 2')).toBeInTheDocument();
  // query1 should finish so isFetching should be 2
  expect(utils.getByText('isFetching: 2')).toBeInTheDocument();
});
