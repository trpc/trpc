/* eslint-disable @typescript-eslint/no-empty-function */
import { createQueryClient } from '../../__queryClient';
import { createLegacyAppRouter } from './__testHelpers';
import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  useQueryClient,
} from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';

let factory: ReturnType<typeof createLegacyAppRouter>;
beforeEach(() => {
  factory = createLegacyAppRouter();
});
afterEach(() => {
  factory.close();
});

describe('prefetchQuery()', () => {
  test('with input', async () => {
    const { trpc, client } = factory;
    function MyComponent() {
      const [state, setState] = useState<string>('nope');
      const utils = trpc.useContext();
      const queryClient = useQueryClient();

      useEffect(() => {
        async function prefetch() {
          await utils.prefetchQuery(['postById', '1']);
          setState(JSON.stringify(dehydrate(queryClient)));
        }
        prefetch();
      }, [queryClient, utils]);

      return <>{JSON.stringify(state)}</>;
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
      expect(utils.container).toHaveTextContent('first post');
    });
  });
});
