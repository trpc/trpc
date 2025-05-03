/** @jsxImportSource solid-js */
import { testSolidResource } from './__helpers';
import '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import { createSignal } from 'solid-js';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';

const testContext = () => {
  let iterableDeferred = createDeferred<void>();
  const nextIterable = () => {
    iterableDeferred.resolve();
    iterableDeferred = createDeferred();
  };
  const t = initTRPC.create({});

  const appRouter = t.router({
    post: t.router({
      byId: t.procedure
        .input(
          z.object({
            id: z.string(),
          }),
        )
        .query(() => '__result' as const),
    }),
  });

  return {
    ...testSolidResource(appRouter),
    nextIterable,
  };
};

describe('useTRPCClient', () => {
  test('fetch and use the client', async () => {
    await using ctx = testContext();

    const { useTRPCClient } = ctx;
    function MyComponent() {
      const vanillaClient = useTRPCClient();
      const [fetchedState, setFetchedState] = createSignal('');

      async function fetch() {
        const state = await vanillaClient.post.byId.query({ id: '1' });
        expectTypeOf<'__result'>(state);
        setFetchedState(state);
      }

      return (
        <>
          <button data-testid="fetch" onClick={fetch}>
            fetch
          </button>

          <pre>Fetched: {fetchedState()}</pre>
        </>
      );
    }

    const utils = ctx.renderApp(<MyComponent />);

    await userEvent.click(utils.getByTestId('fetch'));
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent(`Fetched: __result`);
    });
  });
});
