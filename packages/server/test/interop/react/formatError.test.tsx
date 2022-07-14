/* eslint-disable @typescript-eslint/no-empty-function */
import { createAppRouter } from './__testHelpers';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, setLogger } from 'react-query';
import { DefaultErrorShape } from '../../../src/error/formatter';

setLogger({
  log() {},
  warn() {},
  error() {},
});

let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(() => {
  factory.close();
});

describe('formatError', () => {
  test('react types test', async () => {
    const { trpc, client } = factory;
    function MyComponent() {
      const mutation = trpc.useMutation('addPost');

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
      expect(utils.container).toHaveTextContent('fieldErrors');
      expect(utils.getByTestId('err').innerText).toMatchInlineSnapshot(
        `undefined`,
      );
    });
  });
});
