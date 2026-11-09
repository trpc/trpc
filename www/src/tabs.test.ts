import { runInNewContext } from 'node:vm';

import { describe, expect, it } from '@effect/vitest';

import {
  isUrlTabGroup,
  readSavedTabs,
  savedTabsCss,
  savedTabsScript,
  tabCookie,
  tabSlug,
  tabStoragePrefix,
  validateTabSearch,
} from './tabs.ts';

function storageOf(entries: Record<string, string>) {
  const keys = Object.keys(entries);
  return {
    getItem: (key: string) => entries[key] ?? null,
    key: (index: number) => keys[index] ?? null,
    length: keys.length,
  };
}

describe('tabSlug', () => {
  it('is lower case, without dots, words joined by dashes', () => {
    expect(tabSlug('Next.js')).toBe('nextjs');
    expect(tabSlug('TanStack Start')).toBe('tanstack-start');
    expect(tabSlug('React Router')).toBe('react-router');
    expect(tabSlug(' Vue / Nuxt ')).toBe('vue-nuxt');
  });
});

describe('isUrlTabGroup', () => {
  it('is the framework group only', () => {
    expect(isUrlTabGroup('framework')).toBe(true);
    expect(isUrlTabGroup('package-manager')).toBe(false);
  });
});

describe('validateTabSearch', () => {
  it("keeps the groups' string values and drops everything else", () => {
    expect(
      validateTabSearch({
        framework: 'tanstack-start',
        'package-manager': 'pnpm',
        utm_source: 'x',
      }),
    ).toEqual({ framework: 'tanstack-start' });
    expect(validateTabSearch({ framework: '' })).toEqual({});
    expect(validateTabSearch({ framework: 1 })).toEqual({});
  });
});

describe('readSavedTabs', () => {
  it('reads back what tabCookie and the storage prefix write', () => {
    const cookie = tabCookie('framework', 'TanStack Start').split(';')[0];
    expect(readSavedTabs(`theme=dark; ${cookie}`, null)).toEqual({
      framework: 'TanStack Start',
    });
    expect(
      readSavedTabs(
        '',
        storageOf({ [`${tabStoragePrefix}package-manager`]: 'bun' }),
      ),
    ).toEqual({ 'package-manager': 'bun' });
  });

  it('prefers localStorage over the cookie, and skips malformed cookies', () => {
    expect(
      readSavedTabs(
        'trpc-docs-tab-framework=Next.js; trpc-docs-tab-x=%E0',
        storageOf({ 'trpc-docs:tab:framework': 'React Router', other: 'y' }),
      ),
    ).toEqual({ framework: 'React Router' });
  });
});

describe('savedTabsCss', () => {
  it('shows the saved tab, except in groups the URL picks', () => {
    const css = savedTabsCss(
      { framework: 'Next.js', 'package-manager': 'pn"pm' },
      '?framework=react-router',
    );
    expect(css).not.toContain('framework');
    expect(css).toContain(
      '[data-tabs="package-manager"]:has(> [data-tab="pn\\"pm"]) > [data-tab="pn\\"pm"]{display:block}',
    );
    expect(savedTabsCss({}, '')).toBe('');
  });
});

describe('savedTabsScript', () => {
  it("runs on its own and adds the saved tabs' CSS", () => {
    const appended: Array<{ id: string; textContent: string }> = [];
    const document = {
      cookie: 'trpc-docs-tab-framework=Next.js',
      createElement: () => ({ id: '', textContent: '' }),
      head: {
        append: (style: (typeof appended)[number]) => appended.push(style),
      },
    };
    // A context of its own, with a page's globals: the script can't reach
    // this module.
    runInNewContext(savedTabsScript, {
      document,
      localStorage: storageOf({}),
      location: { search: '' },
      URLSearchParams,
    });
    expect(appended).toHaveLength(1);
    expect(appended[0]?.id).toBe('saved-tabs');
    expect(appended[0]?.textContent).toContain(
      '[data-tab="Next.js"]{display:block}',
    );
  });
});
