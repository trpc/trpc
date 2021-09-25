/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */

import * as trpcServer from '../../src';
jest.mock('@trpc/server', () => trpcServer);
import * as trpcClient from '@trpc/client/src';
jest.mock('@trpc/client', () => trpcClient);
import * as trpcReact from '../../../react/src';
jest.mock('@trpc/react', () => trpcReact);
import * as trpcReact__ssg from '../../../react/src/ssg';
jest.mock('@trpc/react/ssg', () => trpcReact__ssg);

import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { routerToServerAndClient } from '../_testHelpers';

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
