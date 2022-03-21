/* eslint-disable @typescript-eslint/no-empty-function */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/ban-types */

/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/ban-ts-comment */
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import * as trpcClient from '@trpc/client/src';
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import * as trpcReact from '../../../react/src';
import * as trpcReact__ssg from '../../../react/src/ssg';
import * as trpcServer from '../../src';
import { routerToServerAndClient } from '../_testHelpers';

jest.mock('@trpc/server', () => trpcServer);

jest.mock('@trpc/client', () => trpcClient);

jest.mock('@trpc/react', () => trpcReact);

jest.mock('@trpc/react/ssg', () => trpcReact__ssg);

test('initialData type', async () => {
  const { client, router, close } = routerToServerAndClient(
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
    const [queryClient] = useState(() => new QueryClient());
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
