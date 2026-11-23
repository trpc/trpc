// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';

import type * as ReloadOnce from '~/reload-once.ts';
import { reloadPage } from '~/reload-once.ts';

import { DemoBoundary } from './page-demos.tsx';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('~/reload-once.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof ReloadOnce>()),
  reloadPage: vi.fn<() => void>(),
}));

/** Renders a demo that throws `error`, as one whose code failed to load does. */
async function renderFailingDemo(error: Error) {
  vi.mocked(reloadPage).mockClear();
  // React logs what a boundary catches, and so does the boundary.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  const Demo = () => {
    throw error;
  };
  await act(async () => {
    root.render(createElement(DemoBoundary, null, createElement(Demo)));
  });
  expect(container.innerHTML).toBe('');
  await act(async () => {
    root.unmount();
  });
}

// Regression: a demo whose chunk a deploy replaced was hidden for good:
// reloading the page brings it back.
test('a demo whose chunk a deploy replaced reloads the page once', async () => {
  sessionStorage.clear();
  await renderFailingDemo(
    new TypeError(
      'Failed to fetch dynamically imported module: https://trpc.io/assets/waterfalls-DbNVZoEM.js',
    ),
  );
  expect(reloadPage).toHaveBeenCalledTimes(1);
});

test('a demo with a bug is hidden, without a reload', async () => {
  sessionStorage.clear();
  await renderFailingDemo(new Error('A bug'));
  expect(reloadPage).not.toHaveBeenCalled();
});
