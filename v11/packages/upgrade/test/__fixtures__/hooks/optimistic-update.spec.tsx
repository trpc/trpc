import userEvent from '@testing-library/user-event';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { expect, vi } from 'vitest';
import type { SpecRun } from '../../specDef';
import { ctx, resetFixtureState } from './optimistic-update.trpc';

export const run: SpecRun = async (Component) => {
  expect(Component).toBeDefined();

  await using _finally = makeAsyncResource({}, async () => {
    // a run can end (or fail) with the create mutation still in flight — wait
    // for it to settle so it can't re-populate the server AFTER the reset
    // below, which would poison the next run's (or CI retry's) initial fetch
    await vi.waitFor(() => expect(ctx.queryClient.isMutating()).toBe(0));
    resetFixtureState();
    utils.unmount();
  });

  const utils = ctx.renderApp(<Component />);

  await vi.waitFor(() => {
    expect(ctx.queryClient.isFetching()).toBe(0);
    expect(utils.container).toHaveTextContent('Posts: 1initial');
  });

  await userEvent.click(utils.getByTestId('mutate'));
  await vi.waitFor(() => {
    expect(ctx.queryClient.isFetching()).toBe(0);
    expect(utils.container).toHaveTextContent('Posts: 2initialFoo');
  });
};
