import { waitFor } from '@testing-library/dom';
import * as React from 'react';
import { expect } from 'vitest';
import type { SpecRun } from '../../specDef';
import { ctx } from './existingRqMix.trpc';

export const run: SpecRun = async (Component) => {
  expect(Component).toBeDefined();

  ctx.renderApp(<Component />);

  await waitFor(() => {
    expect(ctx.queryClient.isFetching()).toBe(0);
  });
};
