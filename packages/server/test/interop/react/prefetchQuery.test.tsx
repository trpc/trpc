/* eslint-disable @typescript-eslint/no-empty-function */
import { createLegacyAppRouter } from './__testHelpers';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  setLogger,
  useQueryClient,
} from 'react-query';

setLogger({
  log() {},
  warn() {},
  error() {},
});

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
      expect(utils.container).toHaveTextContent('first post');
    });
  });
});
