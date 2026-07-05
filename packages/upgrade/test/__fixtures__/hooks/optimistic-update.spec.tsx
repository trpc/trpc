import userEvent from '@testing-library/user-event';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { expect, vi } from 'vitest';
import type { SpecRun } from '../../specDef';
import { ctx, resetFixtureState } from './optimistic-update.trpc';

export const run: SpecRun = async (Component) => {
  expect(Component).toBeDefined();

  // The query client and server data are shared across every run in this file.
  // Start each run from a clean slate so the initial-render assertion below
  // can't observe stale data left behind by a previous run (which made the
  // first `waitFor` flakily read "Posts: 2initialFoo").
  await ctx.queryClient.cancelQueries();
  ctx.queryClient.clear();
  resetFixtureState();

  using _finally = makeResource({}, () => {
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
