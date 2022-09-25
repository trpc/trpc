/* eslint-disable @typescript-eslint/no-empty-function */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/ban-ts-comment */
import { trpcReact, trpcServer } from '../../___packages';
import { createQueryClient } from '../../__queryClient';
import { legacyRouterToServerAndClient } from '../__legacyRouterToServerAndClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import React, { useState } from 'react';

test('initialData type', async () => {
  const { client, router, close } = legacyRouterToServerAndClient(
    trpcServer.router().query('hello', {
      resolve() {
        return {
          text: 'world',
        };
      },
    }),
  );
  const trpc = trpcReact.createReactQueryHooks<typeof router>();

  function MyComponent() {
    const query = trpc.useQuery(['hello'], {
      initialData: {
        text: 'alexdotjs',
      },
      enabled: false,
    });

    return <pre>{JSON.stringify(query.data ?? 'n/a', null, 4)}</pre>;
  }
  function App() {
    const [queryClient] = useState(() => createQueryClient());
    return (
      <trpc.Provider {...{ queryClient, client }}>
        <QueryClientProvider client={queryClient}>
          <MyComponent />
        </QueryClientProvider>
      </trpc.Provider>
    );
  }

  const utils = render(<App />);
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('alexdotjs');
  });

  close();
});
