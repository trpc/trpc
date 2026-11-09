// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { chooseTab, restoreTabs } from './tabs-dom.ts';

function frameworkTabs() {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="code-tabs" data-tabs="framework">
      <div class="code-tabs-list" role="tablist">
        <button data-tab-group="framework" data-tab-select="TanStack Start"></button>
        <button data-tab-group="framework" data-tab-select="Next.js"></button>
      </div>
      <div data-tab="TanStack Start" data-active></div>
      <div data-tab="Next.js"></div>
    </div>`;
  document.body.append(root);
  return root;
}

const shown = (root: HTMLElement) =>
  root.querySelector('[data-tab][data-active]')?.getAttribute('data-tab');

beforeEach(() => {
  localStorage.clear();
  document.cookie = 'trpc-docs-tab-framework=; Max-Age=0; Path=/';
  history.replaceState(null, '', '/docs/page');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('restoreTabs', () => {
  it("shows the reader's saved tab when the URL picks none", () => {
    localStorage.setItem('trpc-docs:tab:framework', 'Next.js');
    const root = frameworkTabs();
    restoreTabs(root);
    expect(shown(root)).toBe('Next.js');
  });

  it('keeps the tab the URL picks, for a later visit without it', () => {
    localStorage.setItem('trpc-docs:tab:framework', 'TanStack Start');
    history.replaceState(null, '', '/docs/page?framework=nextjs');
    restoreTabs(frameworkTabs());
    expect(localStorage.getItem('trpc-docs:tab:framework')).toBe('Next.js');

    document.body.innerHTML = '';
    history.replaceState(null, '', '/docs/page');
    const later = frameworkTabs();
    restoreTabs(later);
    expect(shown(later)).toBe('Next.js');
  });
});

describe('chooseTab', () => {
  it('keeps a clicked tab when the page restores its tabs again', () => {
    history.replaceState(null, '', '/docs/page?framework=nextjs#frameworks');
    const root = frameworkTabs();
    restoreTabs(root);
    expect(shown(root)).toBe('Next.js');

    chooseTab('framework', 'TanStack Start');
    expect(window.location.search).toBe('?framework=tanstack-start');
    expect(window.location.hash).toBe('#frameworks');
    // Anything that renders the page again restores its tabs.
    restoreTabs(root);
    expect(shown(root)).toBe('TanStack Start');
  });
});
