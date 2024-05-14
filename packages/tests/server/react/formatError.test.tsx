import { createAppRouter } from './__testHelpers';
import { render, waitFor } from '@testing-library/react';
import type { DefaultErrorShape } from '@trpc/server/unstable-core-do-not-import';
import React, { useEffect } from 'react';

let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(async () => {
  await factory.close();
});

test('react types test', async () => {
  const { trpc, App } = factory;
  function MyComponent() {
    const mutation = trpc.addPost.useMutation();

    useEffect(() => {
      mutation.mutate({ title: 123 as any });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (mutation.error?.shape) {
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

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('fieldErrors');
    expect(utils.getByTestId('err').innerText).toMatchInlineSnapshot(
      `undefined`,
    );
  });
});
