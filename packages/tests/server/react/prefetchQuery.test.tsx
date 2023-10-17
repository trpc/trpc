import { createQueryClient } from '../__queryClient';
import { createAppRouter } from './__testHelpers';
import {
  dehydrate,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';

let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(async () => {
  await factory.close();
});

describe('prefetchQuery()', () => {
  test('with input', async () => {
    const { trpc, client } = factory;
    function MyComponent() {
      const [state, setState] = useState<string>('nope');
      const utils = trpc.useUtils();
      const queryClient = useQueryClient();

      useEffect(() => {
        async function prefetch() {
          await utils.postById.prefetch('1');
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
