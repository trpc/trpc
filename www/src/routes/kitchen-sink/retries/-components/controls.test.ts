// @vitest-environment jsdom
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';

import type { Plan } from '../-trpc.ts';
import { Controls } from './controls.tsx';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const plan: Plan = {
  author: 0,
  avatar: 0,
  commenter: null,
  post: 0,
  retry: { attempts: 3, delayMs: 300 },
  stream: true,
  team: 0,
};

async function renderControls(onChange: (plan: Plan) => void) {
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(Controls, { onChange, onLoad: vi.fn(), plan }));
  });
  return makeAsyncResource({ container }, async () => {
    await act(async () => root.unmount());
    container.remove();
  });
}

/** Types a value into a number input, as React hears it */
async function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  await act(async () => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

test('a typed number is kept to the bounds of its input, as an integer', async () => {
  const onChange = vi.fn<(plan: Plan) => void>();
  await using controls = await renderControls(onChange);
  const [post, , , , attempts, delay] = Array.from(
    controls.container.querySelectorAll<HTMLInputElement>(
      'input[type="number"]',
    ),
  );

  await type(post!, '6');
  await type(attempts!, '0');
  await type(delay!, '2.5');
  await type(delay!, '99999');

  expect(onChange.mock.calls.map(([it]) => it)).toEqual([
    { ...plan, post: 5 },
    { ...plan, retry: { attempts: 1, delayMs: 300 } },
    { ...plan, retry: { attempts: 3, delayMs: 2 } },
    { ...plan, retry: { attempts: 3, delayMs: 3000 } },
  ]);
});
