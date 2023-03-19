import { createQueryClient } from '../__queryClient';
import { createAppRouter } from './__testHelpers';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { DefaultErrorShape } from '@trpc/server/src/error/formatter';
import { expectTypeOf } from 'expect-type';
import React, { useEffect, useState } from 'react';

let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(async () => {
  await factory.close();
});

test('react types test', async () => {
  const { trpc, client } = factory;
  function MyComponent() {
    const mutation = trpc.addPost.useMutation();

    useEffect(() => {
      mutation.mutate({ title: 123 as any });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (mutation.error && mutation.error && mutation.error.shape) {
      expectTypeOf(mutation.error.shape).toMatchTypeOf<
        DefaultErrorShape & {
          $test: string;
        }
      >();
      expectTypeOf(mutation.error.shape).toMatchTypeOf<
        DefaultErrorShape & {
          $test: string;
        }
      >();
      return (
        <pre data-testid="err">
          {JSON.stringify(mutation.error.shape.zodError, null, 2)}
        </pre>
      );
    }
    return <></>;
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
    expect(utils.container).toHaveTextContent('fieldErrors');
    expect(utils.getByTestId('err').innerText).toMatchInlineSnapshot(
      `undefined`,
    );
  });
});
