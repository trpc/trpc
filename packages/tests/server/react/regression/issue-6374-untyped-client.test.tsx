import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { httpLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import React from 'react';

// Create router and client
const t = initTRPC.create();
const appRouter = t.router({
  greeting: t.procedure.query(() => 'hello'),
});
const trpc = createTRPCReact<typeof appRouter>();

test('issue-6374-untyped-client', async () => {
  function MyComponent() {
    trpc.greeting.useQuery();
    const utils = trpc.useUtils();

    React.useEffect(() => {
      utils.greeting.prefetch();
    }, [utils]);

    return <div>Test Component</div>;
  }
  function App() {
    const [queryClient] = React.useState(() => new QueryClient());
    const [trpcClient] = React.useState(() =>
      trpc.createClient({
        links: [
          httpLink({
            url: 'http://localhost:3000',
          }),
        ],
      }),
    );
    return (
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <MyComponent />
        </QueryClientProvider>
      </trpc.Provider>
    );
  }

  const utils = render(<App />);

  expect(utils.container).toMatchInlineSnapshot(`
    <div>
      <div>
        Test Component
      </div>
    </div>
  `);
});
