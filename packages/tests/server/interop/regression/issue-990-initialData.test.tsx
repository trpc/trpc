import { createQueryClient } from '../../__queryClient';
import { legacyRouterToServerAndClient } from '../__legacyRouterToServerAndClient';
import { QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import * as trpcReact from '@trpc/react-query/src';
import * as trpcServer from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';
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

    expectTypeOf(query.data).toMatchTypeOf<{ text: string }>();
    expectTypeOf(query.data).not.toMatchTypeOf<undefined>();

    return <pre>{JSON.stringify(query.data, null, 4)}</pre>;
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
