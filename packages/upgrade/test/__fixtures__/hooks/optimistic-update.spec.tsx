import { waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { expect } from 'vitest';
import type { SpecRun } from '../../specDef';
import { ctx, resetFixtureState } from './optimistic-update.trpc';

export const run: SpecRun = async (Component) => {
  expect(Component).toBeDefined();

  const utils = ctx.renderApp(<Component />);

  await waitFor(() => {
    expect(ctx.queryClient.isFetching()).toBe(0);
    expect(utils.container).toHaveTextContent('Posts: 1initial');
  });

  await userEvent.click(utils.getByTestId('mutate'));
  await waitFor(() => {
    expect(ctx.queryClient.isFetching()).toBe(0);
    expect(utils.container).toHaveTextContent('Posts: 2initialFoo');
  });

  resetFixtureState();
  utils.unmount();
};
