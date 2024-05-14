import { getServerAndReactClient } from './__reactHelpers';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React from 'react';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const appRouter = t.router({
      post: t.router({
        create: t.procedure.mutation(() => 'ok' as const),
      }),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

describe('mutation keys', () => {
  test('can grab from cache using correct key', async () => {
    const { client, App } = ctx;

    function MyComponent() {
      const postCreate = client.post.create.useMutation();

      const mutationKey = [['post', 'create']]; // TODO: Maybe add a getter later?
      const isMutating = useIsMutating({ mutationKey });

      const queryClient = useQueryClient();
      const mutationCache = queryClient.getMutationCache();

      React.useEffect(() => {
        postCreate.mutate();
        const mutation = mutationCache.find({ mutationKey });
        expect(mutation).not.toBeUndefined();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      return (
        <div>
          <button
            onClick={() => {
              postCreate.mutate();
            }}
            data-testid="mutate"
          />
          <pre data-testid="status">{isMutating}</pre>
        </div>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    // should be mutating due to effect
    await waitFor(() => {
      expect(utils.getByTestId('status')).toHaveTextContent('1');
    });

    // let the mutation finish
    await waitFor(() => {
      expect(utils.getByTestId('status')).toHaveTextContent('0');
    });

    // should be mutating after button press
    await userEvent.click(utils.getByTestId('mutate'));
    await waitFor(() => {
      expect(utils.getByTestId('status')).toHaveTextContent('1');
    });
  });
});
