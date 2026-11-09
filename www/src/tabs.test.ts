import { describe, expect, it } from '@effect/vitest';

import { isUrlTabGroup, tabSlug, validateTabSearch } from './tabs.ts';

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
