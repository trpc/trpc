import { serverResource } from '../../../../server/src/unstable-core-do-not-import/stream/utils/__tests__/serverResource';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { httpLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import React from 'react';

// Create router and client
const t = initTRPC.create();
const appRouter = t.router({
  greeting: t.procedure.query(() => 'hello'),
});
const trpc = createTRPCReact<typeof appRouter>();

function App(props: { children: React.ReactNode; url: string }) {
  const [queryClient] = React.useState(() => new QueryClient());
  const [trpcClient] = React.useState(() =>
    trpc.createClient({
      links: [
        httpLink({
          url: props.url,
        }),
      ],
    }),
  );
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}

test('useQuery()', async () => {
  await using server = serverResource((req) =>
    fetchRequestHandler({
      router: appRouter,
      createContext: () => ({}),
      req,
      endpoint: '/',
    }),
  );
  function MyComponent() {
    const greeting = trpc.greeting.useQuery();

    return <div>{greeting.data}</div>;
  }
  const utils = render(
    <App url={server.url}>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent('hello');
  });
});

test('useUtils()', async () => {
  await using server = serverResource((req) =>
    fetchRequestHandler({
      router: appRouter,
      createContext: () => ({}),
      req,
      endpoint: '/',
    }),
  );

  function MyComponent() {
    const [data, setData] = React.useState<string>();
    const utils = trpc.useUtils();
    React.useEffect(() => {
      utils.greeting.fetch().then((data) => setData(data));
    }, [utils]);

    return <div>{data}</div>;
  }

  const utils = render(
    <App url={server.url}>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent('hello');
  });
});
