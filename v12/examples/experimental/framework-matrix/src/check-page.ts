import { expect } from 'vite-plus/test';
import type { Framework } from './frameworks.ts';

async function waitFor(assertion: () => void, timeout = 3000) {
  const start = Date.now();
  for (;;) {
    try {
      return assertion();
    } catch (error) {
      if (Date.now() - start > timeout) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

const text = (el: HTMLElement, testId: string) =>
  el.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();

/** What every page does: read the poll, vote, see the count go up, tick. */
export async function checkPage(el: HTMLElement, framework: Framework) {
  await waitFor(() => expect(text(el, `votes-${framework}`)).toMatch(/^\d+$/));
  const before = Number(text(el, `votes-${framework}`));
  el.querySelector('button')!.click();
  await waitFor(() =>
    expect(text(el, `votes-${framework}`)).toBe(String(before + 1)),
  );
  await waitFor(() => expect(text(el, 'clock')).toMatch(/^tick [2-9]/));
}
